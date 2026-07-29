/**
 * The persistent double-entry ledger — Neon Postgres behind the Stripe webhook.
 * APP-BUILD-SPEC rule made real: money lives in Postgres, never solely Firestore.
 * Setup: create a free Neon database (neon.tech) → copy its connection string →
 * add as DATABASE_URL in Vercel env. Schema self-creates on first settlement.
 * Without DATABASE_URL every function stays in demo mode (structured logs only).
 */
import { neon } from "@neondatabase/serverless";

export type Sql = ReturnType<typeof neon>;

let _sql: Sql | null | undefined;
export function getDb(): Sql | null {
  if (_sql !== undefined) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  _sql = url ? neon(url) : null;
  return _sql;
}
/** test hook — lets the test suite inject a fake sql client */
export function __setDbForTests(sql: Sql | null | undefined) { _sql = sql; }

let schemaReady = false;
export async function ensureSchema(sql: Sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS ledger_events (
    event_id text PRIMARY KEY,
    type text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ledger_tx (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    ts timestamptz NOT NULL DEFAULT now(),
    currency text NOT NULL DEFAULT 'GBP',
    refs jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ledger_postings (
    tx_id bigint NOT NULL REFERENCES ledger_tx(id),
    account text NOT NULL,
    delta_minor bigint NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS acu_credits (
    id bigserial PRIMARY KEY,
    stripe_session text UNIQUE,
    email text,
    user_uid text,
    package_id text NOT NULL,
    acu integer NOT NULL,
    category text NOT NULL DEFAULT 'purchased',
    credited_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '12 months'
  )`;
  await sql`CREATE TABLE IF NOT EXISTS founders (
    stripe_session text PRIMARY KEY,
    pass text NOT NULL,
    email text,
    amount_minor bigint,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}

/** Idempotency gate: returns true when this event is NEW (safe to settle). */
export async function claimEvent(sql: Sql, eventId: string, type: string, payload: unknown): Promise<boolean> {
  const rows = (await sql`
    INSERT INTO ledger_events (event_id, type, payload)
    VALUES (${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `) as Array<{ event_id: string }>;
  return rows.length > 0;
}

/** Post a balanced double-entry transaction; refuses unbalanced postings. */
export async function postTx(
  sql: Sql,
  kind: string,
  postings: Array<{ account: string; deltaMinor: number }>,
  refs: Record<string, string> = {},
): Promise<number> {
  const sum = postings.reduce((s, p) => s + p.deltaMinor, 0);
  if (sum !== 0) throw new Error(`Refusing unbalanced ledger tx (${kind}): postings sum to ${sum}`);
  const [tx] = (await sql`
    INSERT INTO ledger_tx (kind, refs) VALUES (${kind}, ${JSON.stringify(refs)}::jsonb) RETURNING id
  `) as Array<{ id: number }>;
  for (const p of postings) {
    await sql`INSERT INTO ledger_postings (tx_id, account, delta_minor) VALUES (${tx.id}, ${p.account}, ${p.deltaMinor})`;
  }
  return tx.id;
}

export async function creditAcu(
  sql: Sql,
  opts: { stripeSession: string; email?: string | null; packageId: string; acu: number },
) {
  await sql`
    INSERT INTO acu_credits (stripe_session, email, package_id, acu)
    VALUES (${opts.stripeSession}, ${opts.email ?? null}, ${opts.packageId}, ${opts.acu})
    ON CONFLICT (stripe_session) DO NOTHING
  `;
}

export async function recordFounder(
  sql: Sql,
  opts: { stripeSession: string; pass: string; email?: string | null; amountMinor?: number | null },
) {
  await sql`
    INSERT INTO founders (stripe_session, pass, email, amount_minor)
    VALUES (${opts.stripeSession}, ${opts.pass}, ${opts.email ?? null}, ${opts.amountMinor ?? null})
    ON CONFLICT (stripe_session) DO NOTHING
  `;
}

/** Platform-wide settled totals (public-safe aggregates for /api/health etc.). */
export async function settledSummary(sql: Sql) {
  const [row] = (await sql`
    SELECT
      (SELECT count(*) FROM ledger_events)                                   AS events,
      (SELECT count(*) FROM ledger_tx)                                       AS transactions,
      (SELECT coalesce(sum(acu), 0) FROM acu_credits)                        AS acu_credited,
      (SELECT count(*) FROM founders)                                        AS founders
  `) as Array<Record<string, string | number>>;
  return row;
}

/* ---------------- games + server-side wallets (Builds 1 & 2) ---------------- */

export async function ensureGameSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS games (
    id text PRIMARY KEY,
    title text NOT NULL,
    summary text,
    language text,
    html text NOT NULL,
    status text NOT NULL DEFAULT 'pending_review',
    creator_wallet text,
    creator_email text,
    plays bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    review_note text
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wallets (
    id text PRIMARY KEY,
    balance bigint NOT NULL DEFAULT 0,
    category text NOT NULL DEFAULT 'tester',
    email text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function createWallet(sql: Sql, id: string, balance: number, category: string, email?: string | null) {
  await sql`INSERT INTO wallets (id, balance, category, email) VALUES (${id}, ${balance}, ${category}, ${email ?? null}) ON CONFLICT (id) DO NOTHING`;
}

/** Refill is TESTER wallets only — real balances only move via Stripe settlement. */
export async function refillTesterWallet(sql: Sql, id: string, to = 2000): Promise<number | null> {
  const rows = (await sql`UPDATE wallets SET balance = ${to} WHERE id = ${id} AND category = 'tester' RETURNING balance`) as Array<{ balance: number }>;
  return rows.length ? Number(rows[0].balance) : null;
}

/** Atomic check-and-debit: returns the new balance, or null if missing/insufficient. */
export async function debitWallet(sql: Sql, id: string, cost: number): Promise<number | null> {
  const rows = (await sql`UPDATE wallets SET balance = balance - ${cost} WHERE id = ${id} AND balance >= ${cost} RETURNING balance`) as Array<{ balance: number }>;
  return rows.length ? Number(rows[0].balance) : null;
}

export async function creditWallet(sql: Sql, id: string, amount: number): Promise<number | null> {
  const rows = (await sql`UPDATE wallets SET balance = balance + ${amount} WHERE id = ${id} RETURNING balance`) as Array<{ balance: number }>;
  return rows.length ? Number(rows[0].balance) : null;
}

export async function getWallet(sql: Sql, id: string) {
  const rows = (await sql`SELECT id, balance, category FROM wallets WHERE id = ${id}`) as Array<{ id: string; balance: number; category: string }>;
  return rows[0] ?? null;
}

export async function saveGame(sql: Sql, g: { id: string; title: string; summary?: string | null; language?: string | null; html: string; creatorWallet?: string | null; creatorEmail?: string | null }) {
  await sql`INSERT INTO games (id, title, summary, language, html, creator_wallet, creator_email)
    VALUES (${g.id}, ${g.title}, ${g.summary ?? null}, ${g.language ?? null}, ${g.html}, ${g.creatorWallet ?? null}, ${g.creatorEmail ?? null})
    ON CONFLICT (id) DO NOTHING`;
}

export async function getGame(sql: Sql, id: string, withHtml = false) {
  const rows = withHtml
    ? ((await sql`SELECT id, title, summary, language, status, plays, created_at, html FROM games WHERE id = ${id}`) as any[])
    : ((await sql`SELECT id, title, summary, language, status, plays, created_at FROM games WHERE id = ${id}`) as any[]);
  return rows[0] ?? null;
}

export async function bumpPlays(sql: Sql, id: string) {
  await sql`UPDATE games SET plays = plays + 1 WHERE id = ${id}`;
}

export async function listPendingGames(sql: Sql) {
  return (await sql`SELECT id, title, summary, language, created_at, creator_email FROM games WHERE status = 'pending_review' ORDER BY created_at ASC LIMIT 50`) as any[];
}

export async function setGameStatus(sql: Sql, id: string, status: "approved" | "rejected", note?: string | null): Promise<boolean> {
  const rows = (await sql`UPDATE games SET status = ${status}, reviewed_at = now(), review_note = ${note ?? null} WHERE id = ${id} RETURNING id`) as any[];
  return rows.length > 0;
}

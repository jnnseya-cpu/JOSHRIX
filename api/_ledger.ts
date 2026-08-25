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
  // refund traceability: a charge must be mappable back to the wallet it funded
  await sql`ALTER TABLE acu_credits ADD COLUMN IF NOT EXISTS payment_intent text`;
  await sql`ALTER TABLE acu_credits ADD COLUMN IF NOT EXISTS wallet_id text`;
  await sql`ALTER TABLE acu_credits ADD COLUMN IF NOT EXISTS clawed_back_at timestamptz`;
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

/** Post a balanced double-entry transaction; refuses unbalanced postings.
 *  All postings land in ONE statement (unnest) so the set is all-or-nothing —
 *  a mid-write failure can never leave a half-posted, unbalanced ledger. */
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
  const accounts = postings.map((p) => p.account);
  const deltas = postings.map((p) => p.deltaMinor);
  await sql`INSERT INTO ledger_postings (tx_id, account, delta_minor)
    SELECT ${tx.id}, a, d FROM unnest(${accounts}::text[], ${deltas}::bigint[]) AS t(a, d)`;
  return tx.id;
}

/** Release a claimed event so a failed settlement can be retried by Stripe. */
export async function unclaimEvent(sql: Sql, eventId: string) {
  await sql`DELETE FROM ledger_events WHERE event_id = ${eventId}`;
}

export async function creditAcu(
  sql: Sql,
  opts: { stripeSession: string; email?: string | null; packageId: string; acu: number; paymentIntent?: string | null; walletId?: string | null },
) {
  await sql`
    INSERT INTO acu_credits (stripe_session, email, package_id, acu, payment_intent, wallet_id)
    VALUES (${opts.stripeSession}, ${opts.email ?? null}, ${opts.packageId}, ${opts.acu}, ${opts.paymentIntent ?? null}, ${opts.walletId ?? null})
    ON CONFLICT (stripe_session) DO NOTHING
  `;
}

/**
 * Refund clawback: find the ACU credit a refunded charge paid for, mark it
 * clawed back ONCE, and return what must be removed from the buyer's wallet.
 * Without this a refunded customer keeps spendable AI credit — the platform
 * pays the provider bill for compute it was never paid for.
 */
export async function claimAcuClawback(sql: Sql, opts: { paymentIntent?: string | null; stripeSession?: string | null }) {
  const rows = (await sql`
    UPDATE acu_credits SET clawed_back_at = now()
    WHERE clawed_back_at IS NULL
      AND ((${opts.paymentIntent ?? null}::text IS NOT NULL AND payment_intent = ${opts.paymentIntent ?? null})
        OR (${opts.stripeSession ?? null}::text IS NOT NULL AND stripe_session = ${opts.stripeSession ?? null}))
    RETURNING acu, wallet_id, package_id`) as Array<{ acu: number; wallet_id: string | null; package_id: string }>;
  return rows[0] ?? null;
}

/** Remove ACUs from a wallet without allowing a negative balance (clawback). */
export async function clawbackWallet(sql: Sql, id: string, amount: number): Promise<{ removed: number; balance: number } | null> {
  // capture the PRE-update balance so `removed` is exact when the wallet has
  // already spent part of the refunded credit (RETURNING sees post-update values)
  const rows = (await sql`
    WITH prev AS (SELECT id, balance FROM wallets WHERE id = ${id})
    UPDATE wallets w SET balance = GREATEST(0, w.balance - ${amount})
    FROM prev WHERE w.id = prev.id
    RETURNING w.balance AS balance, LEAST(${amount}::bigint, prev.balance) AS removed`) as Array<{ balance: number; removed: number }>;
  return rows.length ? { removed: Number(rows[0].removed), balance: Number(rows[0].balance) } : null;
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
    category text NOT NULL DEFAULT 'standard',
    email text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  // NO FREE AI. The column default used to be 'tester', which made every public
  // signup a tester — the one category entitled to free refills. Existing rows
  // are left exactly as they are (reclassifying live wallets is an admin
  // decision, not a migration's), but nothing new is born entitled. Keep this
  // literal in step with DEFAULT_WALLET_CATEGORY in shared/payments.ts.
  await sql`ALTER TABLE forge_log ADD COLUMN IF NOT EXISTS bytes bigint`;
  await sql`ALTER TABLE forge_log ADD COLUMN IF NOT EXISTS models integer`;
  await sql`ALTER TABLE wallets ALTER COLUMN category SET DEFAULT 'standard'`;
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'explorer'`;
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS name text`;
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_refill_at timestamptz`;
  await sql`CREATE TABLE IF NOT EXISTS forge_results (
    ticket text PRIMARY KEY,
    wallet_id text,
    payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS forge_charges (
    id text PRIMARY KEY,
    wallet_id text NOT NULL,
    amount bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    refunded_at timestamptz
  )`;
  // CHARGE ON ACCEPT. `amount` is the HOLD taken before generating; settle_amount
  // is what the run actually cost and is only ever collected if the creator keeps
  // the build. Until then the hold is fully refundable, so a creator who is handed
  // something unplayable pays nothing at all.
  await sql`ALTER TABLE forge_charges ADD COLUMN IF NOT EXISTS settle_amount bigint`;
  await sql`ALTER TABLE forge_charges ADD COLUMN IF NOT EXISTS accepted_at timestamptz`;
  // marketplace listings: the PRICE LIVES HERE, never in the buyer's request
  await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS price_minor bigint`;
  await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS seller_plan text`;
  await sql`CREATE TABLE IF NOT EXISTS entitlements (
    id text PRIMARY KEY,
    game_id text NOT NULL,
    buyer_wallet text,
    buyer_email text,
    price_minor bigint NOT NULL,
    stripe_session text UNIQUE,
    granted_at timestamptz NOT NULL DEFAULT now()
  )`;
  // A refund arrives as charge.refunded, which carries a payment_intent and NOT
  // the checkout session — so without this column a refunded purchase could not
  // be found, and the buyer kept the game they had been paid back for.
  await sql`ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS payment_intent text`;
  await sql`ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS revoked_at timestamptz`;
  await sql`CREATE INDEX IF NOT EXISTS entitlements_pi ON entitlements (payment_intent)`;
  await sql`CREATE INDEX IF NOT EXISTS entitlements_buyer ON entitlements (game_id, buyer_wallet)`;
  await sql`CREATE TABLE IF NOT EXISTS forge_log (
    id bigserial PRIMARY KEY,
    provider text NOT NULL,
    mode text,
    ms integer,
    error text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS dist_requests (
    id bigserial PRIMARY KEY,
    game_id text,
    lane text NOT NULL,
    store text NOT NULL,
    mode text,
    email text,
    wallet_id text,
    status text NOT NULL DEFAULT 'queued',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function createWallet(sql: Sql, id: string, balance: number, category: string, email?: string | null, name?: string | null) {
  await sql`INSERT INTO wallets (id, balance, category, email, name) VALUES (${id}, ${balance}, ${category}, ${email ?? null}, ${name ?? null}) ON CONFLICT (id) DO NOTHING`;
}

/** Keep the human identity fresh — set name/email whenever the client knows them. */
export async function updateWalletIdentity(sql: Sql, id: string, opts: { name?: string | null; email?: string | null }) {
  await sql`UPDATE wallets SET name = COALESCE(${opts.name ?? null}, name), email = COALESCE(${opts.email ?? null}, email) WHERE id = ${id}`;
}

/**
 * Refill: TESTER wallets only — and a tester is designated by an admin holding
 * MODERATION_KEY, never by signing up, which is what keeps free AI closed to
 * everyone else. Tops UP to `to`, never lowers a balance (GREATEST), refuses a
 * wallet already at the ceiling, and can never touch one that has purchased.
 * Returns the new balance, or null when refused.
 *
 * Persistence only — the ceiling and cooldown are POLICY, passed in from
 * shared/payments, so this layer never becomes a second place money rules live.
 */
export async function refillTesterWallet(sql: Sql, id: string, to: number, cooldownSeconds: number): Promise<number | null> {
  // Every guard is in the WHERE clause, so the category check and the top-up are
  // one atomic statement — two concurrent refills cannot both see 'tester' and
  // both credit. GREATEST means a refill can only ever raise a balance.
  const rows = (await sql`
    UPDATE wallets SET balance = GREATEST(balance, ${to}), last_refill_at = now()
    WHERE id = ${id} AND category = 'tester' AND balance < ${to}
      AND (last_refill_at IS NULL OR last_refill_at < now() - make_interval(secs => ${cooldownSeconds}))
    RETURNING balance`) as Array<{ balance: number }>;
  return rows.length ? Number(rows[0].balance) : null;
}

/** Designate (or gate) an account; `category` is validated at the endpoint, as
 *  with setWalletPlan. Returns the new category, or null if the wallet is missing
 *  or PURCHASED — a wallet that has paid is terminal, so no admin action can turn
 *  a real customer into a free-refill tester. */
export async function setWalletCategory(sql: Sql, id: string, category: string): Promise<string | null> {
  const rows = (await sql`
    UPDATE wallets SET category = ${category}
    WHERE id = ${id} AND category <> 'purchased'
    RETURNING category`) as Array<{ category: string }>;
  return rows.length ? String(rows[0].category) : null;
}

/** Stripe settlement marks a wallet as purchased — refill/delete lock out forever. */
export async function markWalletPurchased(sql: Sql, id: string) {
  await sql`UPDATE wallets SET category = 'purchased' WHERE id = ${id}`;
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

/**
 * Persist a finished forge so the Studio can retrieve it on a second channel:
 * the game must arrive even when the original HTTP connection died mid-forge
 * (Wi-Fi blip, laptop sleep, platform reset). Ticket is client-minted per forge.
 */
export async function saveForgeResult(sql: Sql, ticket: string, walletId: string | null, payload: string) {
  await sql`INSERT INTO forge_results (ticket, wallet_id, payload) VALUES (${ticket}, ${walletId}, ${payload})
            ON CONFLICT (ticket) DO UPDATE SET payload = EXCLUDED.payload, wallet_id = EXCLUDED.wallet_id`;
}

export async function getForgeResult(sql: Sql, ticket: string) {
  const rows = (await sql`SELECT wallet_id, payload FROM forge_results WHERE ticket = ${ticket}`) as Array<{ wallet_id: string | null; payload: string }>;
  return rows[0] ?? null;
}

/**
 * Server-side forge history: which provider shipped each build and the exact
 * per-provider error text when every AI failed — so diagnosing a bad run never
 * depends on what the creator's browser happened to display.
 */
/** `bytes` and `models` are the two fields that were missing when they were most
 *  needed. Byte size is what exposed the 8,411-byte stub, and the model count is
 *  the only way to answer "why does it look blocky" without the HTML in hand. */
export async function recordForgeLog(sql: Sql, e: { provider: string; mode?: string | null; ms?: number | null; error?: string | null; bytes?: number | null; models?: number | null }) {
  await sql`INSERT INTO forge_log (provider, mode, ms, error, bytes, models) VALUES (${e.provider}, ${e.mode ?? null}, ${e.ms ?? null}, ${e.error ?? null}, ${e.bytes ?? null}, ${e.models ?? null})`;
}

export async function listForgeLog(sql: Sql, limit = 20) {
  return (await sql`SELECT provider, mode, ms, error, bytes, models, created_at FROM forge_log ORDER BY id DESC LIMIT ${limit}`) as any[];
}

/**
 * Record a settled forge charge so a build that fails to RENDER (a client-side
 * blank, not an AI failure) can be refunded exactly once for exactly what it cost.
 */
export async function recordForgeCharge(sql: Sql, id: string, walletId: string, amount: number) {
  await sql`INSERT INTO forge_charges (id, wallet_id, amount) VALUES (${id}, ${walletId}, ${amount}) ON CONFLICT (id) DO NOTHING`;
}

/**
 * Claim a forge refund: single-use, tied to the paying wallet. Returns the amount
 * to credit (once), or null if unknown/already refunded/wrong wallet. Because a
 * charge id is only ever issued after a real 300-ACU debit, the refund can never
 * exceed what was paid — there is no farming path (net cost is always >= 0).
 */
/**
 * CHARGE ON ACCEPT — the platform's core promise about money.
 *
 * A forge takes a HOLD before generating (so the run cannot be farmed for free)
 * but the hold is not a payment. Nothing is collected unless the creator keeps
 * the build: publishing it or spending an Enhance pass on it. Refine, discard or
 * simply walk away and the entire hold comes back.
 *
 * This exists because the failure that matters is not a build that crashes — the
 * render watchdog already refunds those — it is a build that renders and is
 * worthless. Under the old flow that was charged in full, which is exactly the
 * case a creator would rightly dispute.
 *
 * Every transition is a single conditional UPDATE, so a double-click, a retried
 * request and a race all resolve to one outcome: money moves once or not at all.
 */
export async function recordForgeHold(sql: Sql, id: string, walletId: string, hold: number, settle: number) {
  await sql`INSERT INTO forge_charges (id, wallet_id, amount, settle_amount)
    VALUES (${id}, ${walletId}, ${hold}, ${settle}) ON CONFLICT (id) DO NOTHING`;
}

/** The creator kept it. Collect settle_amount, hand back the rest. Returns the
 *  amount to credit, or null if this hold was already resolved. */
export async function acceptForgeCharge(sql: Sql, id: string, walletId: string): Promise<{ refund: number; charged: number } | null> {
  const rows = (await sql`
    UPDATE forge_charges SET accepted_at = now()
    WHERE id = ${id} AND wallet_id = ${walletId} AND accepted_at IS NULL AND refunded_at IS NULL
    RETURNING amount, COALESCE(settle_amount, amount) AS settle_amount`) as Array<{ amount: number; settle_amount: number }>;
  if (!rows.length) return null;
  const hold = Number(rows[0].amount), charged = Math.min(Number(rows[0].settle_amount), hold);
  return { refund: hold - charged, charged };
}

/** The creator did not keep it. The WHOLE hold goes back — they pay nothing. */
export async function releaseForgeHold(sql: Sql, id: string, walletId: string): Promise<number | null> {
  const rows = (await sql`
    UPDATE forge_charges SET refunded_at = now()
    WHERE id = ${id} AND wallet_id = ${walletId} AND refunded_at IS NULL AND accepted_at IS NULL
    RETURNING amount`) as Array<{ amount: number }>;
  return rows.length ? Number(rows[0].amount) : null;
}

/**
 * A creator who forges and never comes back must not be left short. Any hold
 * still undecided after `hours` is released in full. Run lazily whenever a
 * wallet is read, so this needs no cron and the balance a creator sees is
 * always the balance they actually have.
 */
export async function releaseExpiredForgeHolds(sql: Sql, walletId: string, hours = 24): Promise<number> {
  const rows = (await sql`
    UPDATE forge_charges SET refunded_at = now()
    WHERE wallet_id = ${walletId} AND refunded_at IS NULL AND accepted_at IS NULL
      AND created_at < now() - make_interval(hours => ${hours})
    RETURNING amount`) as Array<{ amount: number }>;
  const total = rows.reduce((n, r) => n + Number(r.amount), 0);
  if (total > 0) await creditWallet(sql, walletId, total);
  return total;
}

/**
 * What a forge hold currently is: how much it costs to keep, and whether it has
 * already been settled or handed back. Read by the publish path, which has to
 * know the difference between "already paid for" and "refunded, so charge again".
 */
export async function getForgeCharge(sql: Sql, id: string, walletId: string) {
  const rows = (await sql`SELECT id, amount, COALESCE(settle_amount, amount) AS settle_amount, accepted_at, refunded_at
    FROM forge_charges WHERE id = ${id} AND wallet_id = ${walletId}`) as Array<{ id: string; amount: number; settle_amount: number; accepted_at: string | null; refunded_at: string | null }>;
  return rows[0] ?? null;
}

/**
 * Collect a forge that was REFUNDED and is now being kept after all.
 *
 * The hole this closes: /api/forge-refund is asserted by the client (its render
 * watchdog reports the build drew nothing), and publishing used to save the game
 * whether or not the charge could be collected. So forge -> refund -> publish
 * was a free game, repeatable for as long as the rate limiter allowed, which
 * made charge-on-accept optional for anyone who read the network tab.
 *
 * Refunding a build the creator then publishes is a contradiction: they are
 * telling us it did not render and hosting it in the same breath. So the refund
 * is reversed — settle_amount is debited afresh — and the row is marked accepted
 * so it cannot be refunded a second time. Atomic: the debit and the state change
 * both carry their guards, and a failed debit leaves the charge untouched.
 *
 * Returns the amount collected, or null when the wallet cannot cover it (the
 * caller must then refuse the publish, not host it on credit).
 */
export async function recollectRefundedForge(sql: Sql, id: string, walletId: string): Promise<number | null> {
  const charge = await getForgeCharge(sql, id, walletId);
  if (!charge || charge.accepted_at || !charge.refunded_at) return null;
  const settle = Math.min(Number(charge.settle_amount), Number(charge.amount));
  if (settle <= 0) return 0;
  const balance = await debitWallet(sql, walletId, settle);
  if (balance === null) return null;                    // cannot pay — publish must refuse
  const rows = (await sql`UPDATE forge_charges SET accepted_at = now(), refunded_at = NULL
    WHERE id = ${id} AND wallet_id = ${walletId} AND accepted_at IS NULL AND refunded_at IS NOT NULL
    RETURNING id`) as any[];
  if (!rows.length) {
    // Lost a race with another accept/recollect — give the money straight back
    // rather than charging twice for one build.
    await creditWallet(sql, walletId, settle);
    return null;
  }
  return settle;
}

export async function claimForgeRefund(sql: Sql, id: string, walletId: string): Promise<number | null> {
  // A build that failed to render is never accepted, so this releases the whole
  // hold — and the accepted_at guard stops it double-refunding one already kept.
  const rows = (await sql`
    UPDATE forge_charges SET refunded_at = now()
    WHERE id = ${id} AND wallet_id = ${walletId} AND refunded_at IS NULL AND accepted_at IS NULL
    RETURNING amount`) as Array<{ amount: number }>;
  return rows.length ? Number(rows[0].amount) : null;
}

export async function getWallet(sql: Sql, id: string) {
  const rows = (await sql`SELECT id, balance, category, email, name, plan FROM wallets WHERE id = ${id}`) as Array<{ id: string; balance: number; category: string; email: string | null; name: string | null; plan: string }>;
  return rows[0] ?? null;
}

/** Exact, case-insensitive lookup of the funded wallet already issued to an
 *  email. The free tester grant is capped at ONE wallet per address; without
 *  this an unauthenticated caller mints unlimited funded wallets (real AI spend). */
export async function getWalletByEmail(sql: Sql, email: string) {
  const rows = (await sql`SELECT id, balance, category, email, name, plan FROM wallets
    WHERE lower(email) = lower(${email}) ORDER BY created_at ASC LIMIT 1`) as any[];
  return rows[0] ?? null;
}

/** Admin lookup: find wallets by (partial) email or display name, case-insensitive —
 *  admins know people, not wallet IDs. Exact email matches sort first. */
export async function findWalletsByIdentity(sql: Sql, q: string, limit = 8) {
  const like = "%" + q + "%";
  return (await sql`
    SELECT id, balance, category, email, name, plan FROM wallets
    WHERE email ILIKE ${like} OR name ILIKE ${like}
    ORDER BY (lower(email) = lower(${q})) DESC, created_at DESC
    LIMIT ${limit}`) as any[];
}

/** Admin-only: put a wallet on a subscription plan (validated at the endpoint). */
export async function setWalletPlan(sql: Sql, id: string, plan: string): Promise<boolean> {
  const rows = (await sql`UPDATE wallets SET plan = ${plan} WHERE id = ${id} RETURNING id`) as any[];
  return rows.length > 0;
}

export async function saveGame(sql: Sql, g: { id: string; title: string; summary?: string | null; language?: string | null; html: string; creatorWallet?: string | null; creatorEmail?: string | null }) {
  await sql`INSERT INTO games (id, title, summary, language, html, creator_wallet, creator_email)
    VALUES (${g.id}, ${g.title}, ${g.summary ?? null}, ${g.language ?? null}, ${g.html}, ${g.creatorWallet ?? null}, ${g.creatorEmail ?? null})
    ON CONFLICT (id) DO NOTHING`;
}

/** `price_minor` rides along because the play route is the paywall: without it
 *  the gate reads undefined and hands a paid game to anyone who asks. */
export async function getGame(sql: Sql, id: string, withHtml = false) {
  const rows = withHtml
    ? ((await sql`SELECT id, title, summary, language, status, plays, created_at, creator_email, creator_wallet, price_minor, html FROM games WHERE id = ${id}`) as any[])
    : ((await sql`SELECT id, title, summary, language, status, plays, created_at, creator_email, creator_wallet, price_minor FROM games WHERE id = ${id}`) as any[]);
  return rows[0] ?? null;
}

/** Anti-flood: how many games a wallet currently has awaiting review. */
export async function countPendingByWallet(sql: Sql, walletId: string): Promise<number> {
  const rows = (await sql`SELECT count(*) AS n FROM games WHERE creator_wallet = ${walletId} AND status = 'pending_review'`) as Array<{ n: string | number }>;
  return Number(rows[0]?.n ?? 0);
}

export async function bumpPlays(sql: Sql, id: string) {
  await sql`UPDATE games SET plays = plays + 1 WHERE id = ${id}`;
}

export async function listPendingGames(sql: Sql) {
  return (await sql`SELECT id, title, summary, language, created_at, creator_email, creator_wallet FROM games WHERE status = 'pending_review' ORDER BY created_at ASC LIMIT 50`) as any[];
}

export async function setGameStatus(sql: Sql, id: string, status: "approved" | "rejected", note?: string | null): Promise<boolean> {
  const rows = (await sql`UPDATE games SET status = ${status}, reviewed_at = now(), review_note = ${note ?? null} WHERE id = ${id} RETURNING id`) as any[];
  return rows.length > 0;
}

/** A creator's own games (dashboard "My Games") — newest first. */
export async function listGamesByWallet(sql: Sql, walletId: string, limit = 50) {
  return (await sql`SELECT id, title, status, plays, price_minor, seller_plan, created_at FROM games WHERE creator_wallet = ${walletId} ORDER BY created_at DESC LIMIT ${limit}`) as any[];
}

/** GDPR delete: removes the wallet row; the creator's published games stay hosted. */
export async function deleteWallet(sql: Sql, id: string): Promise<boolean> {
  const rows = (await sql`DELETE FROM wallets WHERE id = ${id} RETURNING id`) as any[];
  return rows.length > 0;
}

/* ---------------- Communication engine: delivery log ---------------- */

export async function ensureCommsSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS comms_deliveries (
    id bigserial PRIMARY KEY,
    event text NOT NULL,
    channel text NOT NULL,
    recipient text,
    status text NOT NULL,
    provider text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function saveDelivery(sql: Sql, d: { event: string; channel: string; recipient?: string | null; status: string; provider?: string | null }) {
  await sql`INSERT INTO comms_deliveries (event, channel, recipient, status, provider)
    VALUES (${d.event}, ${d.channel}, ${d.recipient ?? null}, ${d.status}, ${d.provider ?? null})`;
}

/** Deliveries of an event in the last N minutes — cheap global rate limiting. */
export async function countRecentDeliveries(sql: Sql, event: string, minutes: number): Promise<number> {
  const rows = (await sql`SELECT count(*) AS n FROM comms_deliveries WHERE event = ${event} AND created_at > now() - make_interval(mins => ${minutes})`) as Array<{ n: string | number }>;
  return Number(rows[0]?.n ?? 0);
}

/** Has this recipient already received this event? (dedupe for public triggers) */
export async function hasDelivery(sql: Sql, event: string, recipient: string): Promise<boolean> {
  const rows = (await sql`SELECT count(*) AS n FROM comms_deliveries WHERE event = ${event} AND recipient = ${recipient}`) as Array<{ n: string | number }>;
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function listDeliveries(sql: Sql, limit = 40) {
  return (await sql`SELECT event, channel, recipient, status, provider, created_at FROM comms_deliveries ORDER BY created_at DESC LIMIT ${limit}`) as any[];
}

/* ---------------- Content Agent: SEO blog on autopilot ---------------- */

export async function ensureBlogSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS blog_posts (
    slug text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    keywords text,
    excerpt text,
    html text NOT NULL,
    social jsonb,
    topic text,
    provider text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function saveBlogPost(sql: Sql, p: { slug: string; title: string; description: string; keywords?: string | null; excerpt?: string | null; html: string; social?: unknown; topic?: string | null; provider?: string | null }) {
  await sql`INSERT INTO blog_posts (slug, title, description, keywords, excerpt, html, social, topic, provider)
    VALUES (${p.slug}, ${p.title}, ${p.description}, ${p.keywords ?? null}, ${p.excerpt ?? null}, ${p.html}, ${JSON.stringify(p.social ?? null)}::jsonb, ${p.topic ?? null}, ${p.provider ?? null})
    ON CONFLICT (slug) DO NOTHING`;
}

export async function getBlogPost(sql: Sql, slug: string) {
  const rows = (await sql`SELECT slug, title, description, keywords, excerpt, html, social, topic, provider, created_at FROM blog_posts WHERE slug = ${slug}`) as any[];
  return rows[0] ?? null;
}

export async function listBlogPosts(sql: Sql, limit = 100) {
  return (await sql`SELECT slug, title, description, excerpt, created_at FROM blog_posts ORDER BY created_at DESC LIMIT ${limit}`) as any[];
}

/**
 * Views per blog post, read from the pageview beacon rather than a counter on
 * the post row.
 *
 * blog_posts has no views column and deliberately does not gain one: a second
 * counter incremented from the article page would drift from the pageviews
 * table the moment one of them failed, and there would be no way to tell which
 * number was true. The beacon already records every path; a post's view count
 * is just that table filtered to its URL.
 *
 * ONE query for every slug asked about, not one per post — a blog index of 60
 * articles would otherwise be 60 round trips to render one page.
 */
export async function blogViews(sql: Sql, slugs: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!slugs.length) return out;
  const paths = slugs.map((s) => "/blog/" + s);
  const rows = (await sql`
    SELECT path, sum(views)::bigint AS views FROM pageviews
    WHERE path = ANY(${paths}) GROUP BY path`) as Array<{ path: string; views: string | number }>;
  for (const r of rows) out[String(r.path).replace(/^\/blog\//, "")] = Number(r.views ?? 0);
  for (const s of slugs) if (!(s in out)) out[s] = 0;
  return out;
}

export async function countBlogPosts(sql: Sql): Promise<number> {
  const rows = (await sql`SELECT count(*) AS n FROM blog_posts`) as Array<{ n: string | number }>;
  return Number(rows[0]?.n ?? 0);
}

/** All wallets, newest first — for the admin grants panel (key-gated at the endpoint). */
export async function listWallets(sql: Sql, limit = 100) {
  return (await sql`SELECT id, balance, category, email, name, plan, created_at FROM wallets ORDER BY created_at DESC LIMIT ${limit}`) as any[];
}

/** Real platform counters for the admin bridge (key-gated at the endpoint). */
export async function adminStats(sql: Sql) {
  const [row] = (await sql`
    SELECT
      (SELECT count(*) FROM games)                                        AS games_total,
      (SELECT count(*) FROM games WHERE status = 'pending_review')        AS games_pending,
      (SELECT count(*) FROM games WHERE status = 'approved')              AS games_approved,
      (SELECT count(*) FROM games WHERE status = 'rejected')              AS games_rejected,
      (SELECT coalesce(sum(plays), 0) FROM games)                         AS plays_total,
      (SELECT count(*) FROM wallets)                                      AS wallets,
      (SELECT coalesce(sum(balance), 0) FROM wallets)                     AS acu_outstanding,
      (SELECT count(*) FROM dist_requests)                                AS dist_requests
  `) as Array<Record<string, string | number>>;
  return row;
}

/** Lane 1 — the Arcade: every approved game, most-played first. */
export async function listApprovedGames(sql: Sql, limit = 60) {
  return (await sql`SELECT id, title, summary, language, plays, price_minor, seller_plan, created_at FROM games WHERE status = 'approved' ORDER BY plays DESC, created_at DESC LIMIT ${limit}`) as any[];
}

/** Lanes 2 & 3 — store-distribution requests join a queue the team works through. */
export async function saveDistRequest(sql: Sql, r: { gameId?: string | null; lane: string; store: string; mode?: string | null; email?: string | null; walletId?: string | null }): Promise<number> {
  const rows = (await sql`INSERT INTO dist_requests (game_id, lane, store, mode, email, wallet_id)
    VALUES (${r.gameId ?? null}, ${r.lane}, ${r.store}, ${r.mode ?? null}, ${r.email ?? null}, ${r.walletId ?? null}) RETURNING id`) as Array<{ id: number }>;
  return Number(rows[0].id);
}

/* ---------------- marketplace: server-authoritative listings ---------------- */

/** The listing a buyer is trying to purchase. Price and seller come from HERE,
 *  never from the request body — a client-supplied price is not a price. */
export async function getListing(sql: Sql, gameId: string) {
  const rows = (await sql`SELECT id, title, status, price_minor, seller_plan, creator_wallet, creator_email
    FROM games WHERE id = ${gameId}`) as Array<{ id: string; title: string; status: string; price_minor: number | null; seller_plan: string | null; creator_wallet: string | null; creator_email: string | null }>;
  return rows[0] ?? null;
}

/** Creator sets their own listing price (validated against the floor upstream).
 *  `priceMinor` null UNLISTS the game — checkout refuses a listing with no price,
 *  so clearing it is how a creator takes a world off sale without deleting it.
 *  The `creator_wallet` predicate is the authorisation: a wallet can only ever
 *  price a game it created, so no id guess reaches another creator's listing. */
export async function setListingPrice(sql: Sql, gameId: string, walletId: string, priceMinor: number | null, sellerPlan: string): Promise<boolean> {
  const rows = (await sql`UPDATE games SET price_minor = ${priceMinor}, seller_plan = ${sellerPlan}
    WHERE id = ${gameId} AND creator_wallet = ${walletId} RETURNING id`) as any[];
  return rows.length > 0;
}

/** Grant a purchase exactly once per Stripe session (idempotent under retries).
 *  `paymentIntent` is what a later refund will arrive quoting, so it is stored
 *  at grant time — there is no way to look it up afterwards. */
export async function grantEntitlement(sql: Sql, e: { id: string; gameId: string; buyerWallet?: string | null; buyerEmail?: string | null; priceMinor: number; stripeSession: string; paymentIntent?: string | null }): Promise<boolean> {
  const rows = (await sql`INSERT INTO entitlements (id, game_id, buyer_wallet, buyer_email, price_minor, stripe_session, payment_intent)
    VALUES (${e.id}, ${e.gameId}, ${e.buyerWallet ?? null}, ${e.buyerEmail ?? null}, ${e.priceMinor}, ${e.stripeSession}, ${e.paymentIntent ?? null})
    ON CONFLICT (stripe_session) DO NOTHING RETURNING id`) as any[];
  return rows.length > 0;
}

/** Does this wallet own this game? A REVOKED entitlement is not ownership — a
 *  buyer who charged back must lose access, or the refund is simply a discount
 *  to zero that anyone can take. */
export async function hasEntitlement(sql: Sql, gameId: string, walletId: string): Promise<boolean> {
  const rows = (await sql`SELECT id FROM entitlements
    WHERE game_id = ${gameId} AND buyer_wallet = ${walletId} AND revoked_at IS NULL LIMIT 1`) as any[];
  return rows.length > 0;
}

/**
 * A refund or chargeback landed. Withdraw the purchase, once, and report what
 * it was worth so the seller's side can be reversed too. Single conditional
 * UPDATE, so a Stripe retry cannot revoke twice and double-claw the seller.
 */
export async function revokeEntitlementByPaymentIntent(sql: Sql, paymentIntent: string) {
  const rows = (await sql`UPDATE entitlements SET revoked_at = now()
    WHERE payment_intent = ${paymentIntent} AND revoked_at IS NULL
    RETURNING id, game_id, buyer_wallet, price_minor`) as Array<{ id: string; game_id: string; buyer_wallet: string | null; price_minor: number }>;
  return rows[0] ?? null;
}

/* ---------------- creator earnings + payout requests ------------------------ */

export async function ensurePayoutSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS payout_requests (
    id text PRIMARY KEY,
    wallet_id text NOT NULL,
    amount_minor bigint NOT NULL,
    fee_minor bigint NOT NULL,
    net_minor bigint NOT NULL,
    rail text NOT NULL,
    destination_ref text,
    status text NOT NULL DEFAULT 'requested',
    kyc_required boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    decided_by text,
    note text
  )`;
  await sql`CREATE TABLE IF NOT EXISTS creator_earnings (
    wallet_id text PRIMARY KEY,
    available_minor bigint NOT NULL DEFAULT 0,
    reserved_minor bigint NOT NULL DEFAULT 0,
    paid_minor bigint NOT NULL DEFAULT 0
  )`;
  // Money from a sale that has not yet outlived the chargeback window. It is the
  // creator's, it shows in their dashboard, and it cannot be withdrawn — see
  // EARNINGS_CLEARING_DAYS for why the platform cannot carry that risk.
  await sql`ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS clearing_minor bigint NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS clawed_back_minor bigint NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS earnings_holds (
    id text PRIMARY KEY,
    wallet_id text NOT NULL,
    amount_minor bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    clears_at timestamptz NOT NULL,
    released_at timestamptz,
    reversed_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS earnings_holds_due ON earnings_holds (wallet_id, clears_at)`;
}

/**
 * Credit a settled marketplace sale to the seller — into CLEARING, not into the
 * withdrawable balance. `holdId` is the entitlement id, which is what a refund
 * arrives able to identify, so a disputed sale can be reversed precisely rather
 * than by clawing at a running total.
 *
 * Both statements are idempotent on holdId: a replayed webhook that slipped past
 * the entitlement guard still cannot pay the seller twice.
 */
export async function creditEarnings(sql: Sql, walletId: string, amountMinor: number, opts?: { holdId?: string; clearingDays?: number }) {
  const holdId = opts?.holdId;
  const days = opts?.clearingDays ?? 0;
  if (!holdId || days <= 0) {
    // No hold identity or no clearing period configured: credit as before. This
    // is the path for anything that is not a disputable card sale.
    await sql`INSERT INTO creator_earnings (wallet_id, available_minor) VALUES (${walletId}, ${amountMinor})
      ON CONFLICT (wallet_id) DO UPDATE SET available_minor = creator_earnings.available_minor + ${amountMinor}`;
    return;
  }
  const rows = (await sql`INSERT INTO earnings_holds (id, wallet_id, amount_minor, clears_at)
    VALUES (${holdId}, ${walletId}, ${amountMinor}, now() + make_interval(days => ${days}))
    ON CONFLICT (id) DO NOTHING RETURNING id`) as any[];
  if (!rows.length) return;   // already credited by an earlier delivery of this event
  await sql`INSERT INTO creator_earnings (wallet_id, clearing_minor) VALUES (${walletId}, ${amountMinor})
    ON CONFLICT (wallet_id) DO UPDATE SET clearing_minor = creator_earnings.clearing_minor + ${amountMinor}`;
}

/**
 * Move matured holds into the withdrawable balance. Run lazily wherever earnings
 * are read, so no cron is required and the figure a creator sees is always the
 * figure they can actually request — the same pattern as releaseExpiredForgeHolds.
 */
export async function releaseClearedEarnings(sql: Sql, walletId: string): Promise<number> {
  const rows = (await sql`UPDATE earnings_holds SET released_at = now()
    WHERE wallet_id = ${walletId} AND released_at IS NULL AND reversed_at IS NULL AND clears_at <= now()
    RETURNING amount_minor`) as Array<{ amount_minor: number }>;
  const total = rows.reduce((n, r) => n + Number(r.amount_minor), 0);
  if (total > 0) {
    await sql`UPDATE creator_earnings
      SET available_minor = available_minor + ${total}, clearing_minor = GREATEST(0, clearing_minor - ${total})
      WHERE wallet_id = ${walletId}`;
  }
  return total;
}

/**
 * Reverse one sale's earnings after a refund or chargeback.
 *
 * Three cases, and the order matters because it decides who absorbs the loss:
 *   still clearing  -> take it straight back out of clearing. Costs nobody.
 *   cleared, unspent-> take it out of available.
 *   already paid out-> take what is left and report the SHORTFALL. That figure
 *                      is a real debt to chase, and it is returned rather than
 *                      swallowed so the operator alert can name it.
 */
export async function reverseEarnings(sql: Sql, holdId: string): Promise<{ walletId: string; amountMinor: number; fromClearing: number; fromAvailable: number; shortfallMinor: number } | null> {
  const rows = (await sql`UPDATE earnings_holds SET reversed_at = now()
    WHERE id = ${holdId} AND reversed_at IS NULL
    RETURNING wallet_id, amount_minor, released_at`) as Array<{ wallet_id: string; amount_minor: number; released_at: string | null }>;
  if (!rows.length) return null;
  const walletId = rows[0].wallet_id, amountMinor = Number(rows[0].amount_minor);

  if (!rows[0].released_at) {
    // Never cleared, so it was never withdrawable — the clean case.
    await sql`UPDATE creator_earnings SET clearing_minor = GREATEST(0, clearing_minor - ${amountMinor}) WHERE wallet_id = ${walletId}`;
    return { walletId, amountMinor, fromClearing: amountMinor, fromAvailable: 0, shortfallMinor: 0 };
  }
  // Cleared. Take back as much as is still sitting there, never below zero — a
  // negative balance would block every future payout for a debt they may not owe.
  //
  // The CTE snapshots the balance BEFORE the update: RETURNING sees post-update
  // values, so "how much did we actually take" has to be read from `prev` or it
  // reports the remainder instead of the amount.
  const back = (await sql`
    WITH prev AS (SELECT wallet_id, available_minor FROM creator_earnings WHERE wallet_id = ${walletId})
    UPDATE creator_earnings ce
    SET available_minor = GREATEST(0, ce.available_minor - ${amountMinor}),
        clawed_back_minor = ce.clawed_back_minor + LEAST(prev.available_minor, ${amountMinor})
    FROM prev
    WHERE ce.wallet_id = prev.wallet_id
    RETURNING LEAST(prev.available_minor, ${amountMinor}) AS taken`) as Array<{ taken: number }>;
  const fromAvailable = Number(back[0]?.taken ?? 0);
  return { walletId, amountMinor, fromClearing: 0, fromAvailable, shortfallMinor: amountMinor - fromAvailable };
}

export async function getEarnings(sql: Sql, walletId: string) {
  // Mature anything due before reporting, so "available" is never a figure that
  // a payout request would then refuse.
  try { await releaseClearedEarnings(sql, walletId); } catch { /* reporting must not fail on the sweep */ }
  const rows = (await sql`SELECT wallet_id, available_minor, reserved_minor, paid_minor, clearing_minor FROM creator_earnings WHERE wallet_id = ${walletId}`) as any[];
  return rows[0] ?? { wallet_id: walletId, available_minor: 0, reserved_minor: 0, paid_minor: 0, clearing_minor: 0 };
}

/**
 * Reserve funds for a withdrawal ATOMICALLY. Returns false when the creator
 * cannot cover it — two concurrent requests cannot both succeed, so a creator
 * can never withdraw the same earnings twice.
 */
export async function reserveForPayout(sql: Sql, walletId: string, amountMinor: number): Promise<boolean> {
  const rows = (await sql`UPDATE creator_earnings
    SET available_minor = available_minor - ${amountMinor}, reserved_minor = reserved_minor + ${amountMinor}
    WHERE wallet_id = ${walletId} AND available_minor >= ${amountMinor}
    RETURNING wallet_id`) as any[];
  return rows.length > 0;
}

/**
 * A payout actually executed. The money leaves `reserved` and lands in `paid`.
 *
 * Nothing did this before: `reserveForPayout` moved the amount out of available
 * and into reserved, and marking the request paid updated only the request row.
 * So `reserved_minor` grew for the lifetime of the account and never fell, which
 * made the earnings table disagree with reality the first time anyone was paid —
 * and reconciling a creator's balance against it would have shown money still
 * held that had long since been sent.
 */
export async function settleReservation(sql: Sql, walletId: string, amountMinor: number) {
  await sql`UPDATE creator_earnings
    SET reserved_minor = GREATEST(0, reserved_minor - ${amountMinor}), paid_minor = paid_minor + ${amountMinor}
    WHERE wallet_id = ${walletId}`;
}

/** Release a reservation when a payout is rejected or fails. */
export async function releaseReservation(sql: Sql, walletId: string, amountMinor: number) {
  await sql`UPDATE creator_earnings
    SET available_minor = available_minor + ${amountMinor}, reserved_minor = GREATEST(0, reserved_minor - ${amountMinor})
    WHERE wallet_id = ${walletId}`;
}

export async function savePayoutRequest(sql: Sql, r: { id: string; walletId: string; amountMinor: number; feeMinor: number; netMinor: number; rail: string; destinationRef: string; kycRequired: boolean }) {
  await sql`INSERT INTO payout_requests (id, wallet_id, amount_minor, fee_minor, net_minor, rail, destination_ref, kyc_required)
    VALUES (${r.id}, ${r.walletId}, ${r.amountMinor}, ${r.feeMinor}, ${r.netMinor}, ${r.rail}, ${r.destinationRef}, ${r.kycRequired})`;
}

export async function listPayoutRequests(sql: Sql, status = "requested", limit = 50) {
  return (await sql`SELECT id, wallet_id, amount_minor, fee_minor, net_minor, rail, status, kyc_required, created_at
    FROM payout_requests WHERE status = ${status} ORDER BY created_at ASC LIMIT ${limit}`) as any[];
}

/**
 * Operator decision, as a state machine in the WHERE clause:
 *
 *   requested -> approved | rejected | paid
 *   approved  -> paid
 *
 * The endpoint has always told the operator "Approved — mark 'paid' once the
 * rail has executed", but the predicate was `status = 'requested'` alone, so
 * that second step could never succeed: an approved withdrawal was stuck, and
 * the only way to record that money had actually left was to edit the database
 * by hand. Approving is not paying, so both steps have to exist.
 *
 * Everything else about the guard is unchanged and load-bearing: a decision is
 * still atomic and single-use, so two operators clicking at once produce one
 * transition, and a rejected request can never be rejected twice (which would
 * release the creator's reservation twice and pay them for nothing).
 */
export async function decidePayoutRequest(sql: Sql, id: string, status: "approved" | "rejected" | "paid", by: string, note?: string | null) {
  const from = status === "paid" ? ["requested", "approved"] : ["requested"];
  const rows = (await sql`UPDATE payout_requests SET status = ${status}, decided_at = now(), decided_by = ${by}, note = ${note ?? null}
    WHERE id = ${id} AND status = ANY(${from}) RETURNING id, wallet_id, amount_minor, status`) as any[];
  return rows[0] ?? null;
}

/* ---------------- newsletter: subscription state + send idempotency --------- */

/**
 * Marketing email is legally different from service email. Under UK GDPR/PECR a
 * recipient must be able to stop it, and that decision has to survive
 * everything — so it lives in its own table keyed by address, not on the wallet
 * row. An address that unsubscribed while holding one wallet must stay
 * unsubscribed if it later holds another.
 *
 * newsletter_sends exists for idempotency. Vercel can retry a cron, and a
 * mailing that goes out twice is worse than one that does not go out at all:
 * it burns the sending domain's reputation, which is not recoverable by
 * shipping a fix. The unique constraint on (email, issue) makes a repeat send
 * impossible rather than unlikely.
 */
export async function ensureNewsletterSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS email_prefs (
    email text PRIMARY KEY,
    unsubscribed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS newsletter_sends (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    issue text NOT NULL,
    status text NOT NULL,
    provider text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email, issue)
  )`;
}

/** Every registered address that has not opted out. One row per address: a
 *  person with two wallets must not receive the mailing twice. */
export async function newsletterAudience(sql: Sql, issue: string, limit = 500): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT lower(w.email) AS email
      FROM wallets w
      LEFT JOIN email_prefs p ON p.email = lower(w.email)
      LEFT JOIN newsletter_sends s ON s.email = lower(w.email) AND s.issue = ${issue}
     WHERE w.email IS NOT NULL AND w.email <> ''
       AND p.unsubscribed_at IS NULL
       AND s.id IS NULL
     LIMIT ${limit}`) as Array<{ email: string }>;
  return rows.map((r) => r.email);
}

/** Claim an address for this issue BEFORE sending. Returns false if another
 *  run already claimed it, which is what makes a retried cron safe. */
export async function claimNewsletterSend(sql: Sql, email: string, issue: string): Promise<boolean> {
  const rows = (await sql`
    INSERT INTO newsletter_sends (email, issue, status)
    VALUES (${email.toLowerCase()}, ${issue}, 'claimed')
    ON CONFLICT (email, issue) DO NOTHING
    RETURNING id`) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function recordNewsletterSend(sql: Sql, email: string, issue: string, status: string, provider: string) {
  await sql`UPDATE newsletter_sends SET status = ${status}, provider = ${provider}
    WHERE email = ${email.toLowerCase()} AND issue = ${issue}`;
}

export async function unsubscribeEmail(sql: Sql, email: string) {
  await sql`INSERT INTO email_prefs (email, unsubscribed_at) VALUES (${email.toLowerCase()}, now())
    ON CONFLICT (email) DO UPDATE SET unsubscribed_at = now()`;
}

export async function resubscribeEmail(sql: Sql, email: string) {
  await sql`INSERT INTO email_prefs (email, unsubscribed_at) VALUES (${email.toLowerCase()}, NULL)
    ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL`;
}

export async function isUnsubscribed(sql: Sql, email: string): Promise<boolean> {
  const rows = (await sql`SELECT unsubscribed_at FROM email_prefs WHERE email = ${email.toLowerCase()}`) as Array<{ unsubscribed_at: string | null }>;
  return !!rows[0]?.unsubscribed_at;
}

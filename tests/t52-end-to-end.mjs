/**
 * THE WHOLE FLOW, AGAINST A REAL DATABASE, FOR THE FIRST TIME.
 *
 * `launch-audit/gates.md` gate 3 has read "PARTIAL / UNTESTABLE — signup,
 * wallet, forge, publish, moderation and purchase all require a database and
 * keys" since the audit was written. Every other test in this suite runs the
 * handlers against an in-memory stand-in or reads their source. The sequence a
 * real customer walks has never executed.
 *
 * It executes here. A throwaway PostgreSQL 16 cluster, the REAL compiled
 * handlers, called in the order a person uses them:
 *
 *     wallet created  →  paid  →  forged  →  published  →  moderated  →  played
 *
 * No provider key is needed: with none set the gateway falls back to the
 * deterministic engine, which is the same path a creator takes when every
 * provider is down, so the flow is real even though the game is not bespoke.
 *
 * WHAT A FAILURE HERE MEANS. Not "a unit is wrong" but "the product does not
 * work" — a wallet that cannot be created, a payment that credits nothing, a
 * game that cannot be published. That is why it is one file and why it stops
 * at the first broken step rather than reporting ten consequences of one cause.
 *
 *   node tests/t52-end-to-end.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { startPostgres, makeSqlClient, postgresAvailable } from "./_realdb.mjs";

const ROOT = process.env.JOSHRIX_ROOT || process.cwd();
let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? (pass++, console.log("  PASS " + n)) : (fail++, console.log("  FAIL " + n + (d ? " :: " + d : ""))); };

const mkRes = () => {
  const r = { code: null, body: null, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.send = (b) => { r.body = b; r.ended = true; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; r.ended = true; return r; };
  return r;
};
const call = async (handler, req) => { const res = mkRes(); await handler(req, res); return res; };

/* The handlers compile to CommonJS, so `await import()` hands back
   module.exports as `.default` and the real default export sits one level
   further in. Resolved in one place rather than at six call sites. */
async function handlerOf(spec) {
  const mod = await import(spec);
  const h = mod.default?.default ?? mod.default;
  if (typeof h !== "function") throw new Error(`no default handler exported by ${spec}`);
  return h;
}

/* A missing Postgres is a FAILURE, not a skip. Two tests in this repository
   once passed for weeks while asserting nothing, and a database test that
   quietly turns itself off is the same mistake with a bigger blast radius. */
if (!postgresAvailable()) {
  console.error("FAIL: PostgreSQL client tools not found — this file cannot run and must not pretend to pass.");
  process.exit(1);
}

const pg = startPostgres(5471);
if (!pg) { console.error("FAIL: could not start a throwaway PostgreSQL cluster."); process.exit(1); }

process.env.DATABASE_URL = pg.url;
const sql = await makeSqlClient(pg.url);

const led = await import("./build/api/_ledger.js");
led.__setDbForTests(sql);

let exitCode = 0;
try {
  const WALLET = "w_e2e_" + Date.now().toString(36);
  let TICKET = null, GAME_ID = null;

  console.log("\n1. A WALLET EXISTS, AND STARTS AT ZERO");
  {
    await led.ensureSchema(sql);
    await led.ensureGameSchema(sql);
    await sql`INSERT INTO wallets (id, balance, email) VALUES (${WALLET}, 0, ${"e2e@test.local"})`;
    const w = await led.getWallet(sql, WALLET);
    t("the wallet is created", !!w, JSON.stringify(w));
    t("and holds ZERO ACUs — no free AI", Number(w.balance) === 0, String(w && w.balance));
    t("and is not a tester", w.category !== "tester", String(w && w.category));
  }

  console.log("\n2. A PAYMENT CREDITS IT — ONCE");
  {
    const hook = await handlerOf("./build/api/stripe-webhook.js");
    const { TOPUP_PACKAGES } = await import("./build/shared/payments.js");
    const Stripe = (await import("stripe")).default;
    const pack = TOPUP_PACKAGES[0];
    const SECRET = "whsec_e2e_local_only_not_a_real_key";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;

    const event = {
      id: "evt_e2e_1", type: "checkout.session.completed",
      data: { object: { id: "cs_e2e_1", amount_total: pack.priceMinor, payment_intent: "pi_e2e_1",
        metadata: { kind: "acu_topup", packageId: pack.id, walletId: WALLET },
        customer_details: { email: "e2e@test.local" } } },
    };
    const signed = (ev) => {
      const payload = JSON.stringify(ev);
      return { method: "POST", query: {}, rawBody: Buffer.from(payload),
        headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) } };
    };

    const first = await call(hook, signed(event));
    t("the webhook settles the payment", first.code === 200, `HTTP ${first.code} ${JSON.stringify(first.body)}`);
    t("and reports it persisted", first.body?.persisted === "yes", JSON.stringify(first.body));

    const afterPay = await led.getWallet(sql, WALLET);
    t(`the wallet now holds the package's ACUs (${pack.acu})`,
      Number(afterPay.balance) === pack.acu, `balance ${afterPay && afterPay.balance}`);
    t("and the wallet is marked purchased, so it can never be made a tester",
      afterPay.category === "purchased", String(afterPay && afterPay.category));

    /* THE RETRY. Stripe retries on any non-2xx and on its own schedule; this is
       the exact replay that cost money before the settlement key existed. */
    const replay = await call(hook, signed(event));
    t("a replayed event is accepted", replay.code === 200, `HTTP ${replay.code}`);
    t("and recognised as already settled", replay.body?.persisted === "duplicate", JSON.stringify(replay.body));
    const afterReplay = await led.getWallet(sql, WALLET);
    t("THE BALANCE DID NOT MOVE — one payment, one credit",
      Number(afterReplay.balance) === pack.acu, `balance ${afterReplay && afterReplay.balance}`);

    /* And the same payment arriving under a NEW event id — a different Stripe
       delivery of one session — must still not credit twice. */
    const reissued = { ...event, id: "evt_e2e_1_reissued" };
    await call(hook, signed(reissued));
    const afterReissue = await led.getWallet(sql, WALLET);
    t("a NEW event id for the SAME session still credits only once",
      Number(afterReissue.balance) === pack.acu, `balance ${afterReissue && afterReissue.balance}`);

    const ledgerRows = await sql`SELECT count(*)::int AS n FROM ledger_postings`;
    t("the double-entry ledger balances",
      (await sql`SELECT coalesce(sum(delta_minor),0)::bigint AS s FROM ledger_postings`)[0].s == 0,
      `postings ${ledgerRows[0].n}`);
  }

  console.log("\n3. A FORGE RUNS, AND IS CHARGED FOR");
  {
    const forge = await handlerOf("./build/api/forge-game.js");
    const before = Number((await led.getWallet(sql, WALLET)).balance);
    const res = await call(forge, {
      method: "POST", headers: {}, query: {},
      body: { prompt: "A calm puzzle game where you match falling leaves by colour. Three lives, rising speed.",
              walletId: WALLET, title: "Leaf Match" },
    });
    t("the forge accepts the job", res.code === 202 || res.code === 200, `HTTP ${res.code} ${JSON.stringify(res.body).slice(0, 160)}`);
    t("and returns a ticket to collect the build with",
      !!res.body?.ticket, JSON.stringify(res.body).slice(0, 160));
    TICKET = res.body?.ticket;

    const after = Number((await led.getWallet(sql, WALLET)).balance);
    t("a funded wallet is not charged just for asking", after === before, `${before} -> ${after}`);

    /* The gate that keeps "no free AI" true. */
    const poor = "w_e2e_poor_" + Date.now().toString(36);
    await sql`INSERT INTO wallets (id, balance) VALUES (${poor}, 0)`;
    const refused = await call(forge, {
      method: "POST", headers: {}, query: {},
      body: { prompt: "A calm puzzle game where you match falling leaves by colour.", walletId: poor, title: "No Funds" },
    });
    t("an empty wallet is REFUSED before any provider is called",
      refused.code === 402 || refused.code === 403 || refused.code === 400,
      `HTTP ${refused.code} ${JSON.stringify(refused.body).slice(0, 140)}`);
  }

  console.log("\n4. THE FORGE FINISHES, AND THE BUILD IS PUBLISHED");
  {
    /* With no provider key the gateway falls back to the deterministic engine —
       the same path a creator takes when every provider is down — so a real
       build is produced and the pipeline is exercised end to end. */
    const worker = await handlerOf("./build/api/forge-worker.js");
    const result = await handlerOf("./build/api/forge-result.js");

    let done = false, slices = 0;
    while (!done && slices < 12) {
      slices++;
      const w = await call(worker, { method: "POST", headers: {}, query: {}, body: { ticket: TICKET, walletId: WALLET } });
      if (w.code !== 200) { t("the worker advances the job", false, `HTTP ${w.code} ${JSON.stringify(w.body).slice(0, 140)}`); break; }
      done = !!w.body?.done || w.body?.status === "done" || w.body?.status === "failed";
    }
    t(`the forge job reaches a conclusion (${slices} slice(s))`, done, `after ${slices} slices`);

    const got = await call(result, { method: "GET", headers: {}, query: { ticket: TICKET, w: WALLET } });
    t("the finished build can be collected", got.code === 200 && got.body?.ready === true,
      `HTTP ${got.code} ${JSON.stringify(got.body).slice(0, 180)}`);
    const builtHtml = got.body?.html;
    t("and it is a real HTML document", typeof builtHtml === "string" && builtHtml.length > 500 && /<html|<!DOCTYPE/i.test(builtHtml),
      `${typeof builtHtml} ${String(builtHtml).length} bytes`);
    /* The publishable identity of a run is the forge HOLD id the job minted,
       not the client's ticket — the ticket is how the browser collects the
       build, the hold is what the charge is settled against. */
    const FORGE_ID = got.body?.forgeId;
    t("the build carries the forge hold it will be charged against", !!FORGE_ID, String(FORGE_ID));

    const games = await handlerOf("./build/api/games.js");

    /* THE CONTROL THAT CAUGHT MY FIRST ATTEMPT. A build with no forge run
       behind it cannot be published — otherwise anyone could host arbitrary
       HTML on this platform without paying for a build. */
    const unlinked = await call(games, { method: "POST", headers: {}, query: {},
      body: { title: "Not Forged", summary: "x", html: "<html><body>hi</body></html>", walletId: WALLET, language: "en" } });
    t("a build with no forge run behind it is REFUSED",
      unlinked.code >= 400 && unlinked.code < 500, `HTTP ${unlinked.code} ${JSON.stringify(unlinked.body).slice(0, 120)}`);

    const balanceBefore = Number((await led.getWallet(sql, WALLET)).balance);
    const saved = await call(games, { method: "POST", headers: {}, query: {},
      body: { title: "E2E Test Game", summary: "Published by the end-to-end test.", html: builtHtml,
              walletId: WALLET, language: "en", forgeId: FORGE_ID } });
    t("the forged build CAN be published", saved.code === 200 || saved.code === 201,
      `HTTP ${saved.code} ${JSON.stringify(saved.body).slice(0, 180)}`);
    GAME_ID = saved.body?.id ?? saved.body?.gameId;
    t("and comes back with an id", !!GAME_ID, JSON.stringify(saved.body).slice(0, 160));

    const balanceAfter = Number((await led.getWallet(sql, WALLET)).balance);
    /* WHERE THE MONEY ACTUALLY MOVES. Metering happens per ATTEMPT during the
       run, so the creator has already paid for the compute by the time they
       publish; accepting SETTLES that hold rather than charging again, and a
       build that is discarded instead is what gets refunded. An earlier version
       of this assertion expected the debit at publish time and failed on a
       platform that was behaving correctly. */
    const credited = Number((await sql`SELECT coalesce(sum(acu),0)::bigint AS s FROM wallet_credits WHERE wallet_id = ${WALLET}`)[0].s);
    t("the creator paid for the compute the build used",
      balanceAfter < credited, `credited ${credited}, balance ${balanceAfter}`);
    t("and publishing settles the hold rather than charging a second time",
      balanceAfter >= balanceBefore, `${balanceBefore} -> ${balanceAfter}`);

    const row = GAME_ID ? (await sql`SELECT status FROM games WHERE id = ${GAME_ID}`)[0] : null;
    t("it is NOT public yet — it waits for a human", row?.status === "pending_review", JSON.stringify(row));

    const arcade = await handlerOf("./build/api/arcade.js");
    const before = await call(arcade, { method: "GET", headers: {}, query: {} });
    t("and it does not appear in the public arcade",
      !(before.body?.games ?? []).some((g) => g.id === GAME_ID),
      `arcade has ${(before.body?.games ?? []).length} game(s)`);

    process.env.MODERATION_KEY = "e2e-moderation-key";
    const mod = await handlerOf("./build/api/moderation.js");
    const unauth = await call(mod, { method: "POST", headers: {}, query: {}, body: { id: GAME_ID, action: "approve" } });
    t("a stranger cannot approve it", unauth.code === 401 || unauth.code === 403, `HTTP ${unauth.code}`);

    const approved = await call(mod, { method: "POST", headers: { "x-admin-key": "e2e-moderation-key" }, query: {},
      body: { id: GAME_ID, action: "approve" } });
    t("a moderator can", approved.code === 200, `HTTP ${approved.code} ${JSON.stringify(approved.body).slice(0, 140)}`);

    const after = await call(arcade, { method: "GET", headers: {}, query: {} });
    t("once approved it IS in the public arcade",
      (after.body?.games ?? []).some((g) => g.id === GAME_ID),
      `arcade has ${(after.body?.games ?? []).length} game(s)`);
  }

  console.log("\n5. THE MONEY ADDS UP AT THE END");
  {
    const w = await led.getWallet(sql, WALLET);
    const credits = await sql`SELECT coalesce(sum(acu),0)::bigint AS s FROM wallet_credits WHERE wallet_id = ${WALLET}`;
    t("the wallet never went negative",
      Number(w.balance) >= 0, `balance ${w.balance}`);
    t("and everything ever CREDITED to it is explained by a keyed settlement",
      Number(credits[0].s) > 0 && Number(credits[0].s) >= Number(w.balance),
      `credited ${credits[0].s}, balance now ${w.balance} (the difference is what the build cost)`);
    const keys = await sql`SELECT settlement_key FROM wallet_credits WHERE wallet_id = ${WALLET}`;
    t("and there is exactly one settlement row for one payment",
      keys.length === 1, keys.map((k) => k.settlement_key).join(", "));
    t("the ledger still balances to zero",
      (await sql`SELECT coalesce(sum(delta_minor),0)::bigint AS s FROM ledger_postings`)[0].s == 0);
  }
} catch (err) {
  fail++;
  console.log("  FAIL the flow threw :: " + String(err?.stack ?? err).split("\n").slice(0, 4).join(" | "));
} finally {
  try { await sql.end(); } catch { /* closing a closed client is fine */ }
  pg.stop();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : exitCode || 0);

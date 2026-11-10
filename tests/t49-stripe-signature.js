/**
 * THE TWO MONEY ITEMS THAT WERE "UNTESTABLE WITHOUT LIVE ACCOUNTS".
 *
 * launch-audit/human-actions.md items 4 and 5 — run one live payment cycle, and
 * restore one snapshot — were both listed as things only Justin could do. Half
 * of each turns out to be testable here, and this file is that half: the webhook
 * door tested with a REAL signature and no Stripe account, and the recovery
 * drill's refusals tested without a database.
 *
 * THE MONEY DOOR, TESTED WITH A REAL SIGNATURE AND NO STRIPE ACCOUNT.
 *
 * `/api/stripe-webhook` is the only route by which ACUs come into existence for
 * money. Everything about it was previously tested by reading it (t31 checks the
 * route and the ordering), because "run one live payment cycle" sat on the human
 * action list as the only way to exercise it.
 *
 * It is not. The Stripe SDK can SIGN a payload locally —
 * `Stripe.webhooks.generateTestHeaderString` — and the handler answers
 * `persisted: "no_db"` when DATABASE_URL is absent. So the whole door can be
 * tested here: a genuine signature is accepted, a tampered body is refused, the
 * wrong secret is refused, a stale timestamp is refused, and a missing secret
 * fails CLOSED rather than answering 200 to anybody.
 *
 * That last one is the assertion that matters most. A webhook that returns 200
 * without verifying is an endpoint where anyone who knows the URL can mint
 * ACUs, and it would look perfectly healthy in every log.
 *
 * What this still cannot prove, and nobody should read it as proving: that
 * Stripe's real dashboard is configured with the right events, that settlement
 * actually credits a wallet in Postgres, or that the ledger balances after a
 * real purchase. Those need the live cycle in tests/live-payment-cycle.md.
 *
 *   node tests/t49-stripe-signature.js
 */
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const ROOT = process.env.JOSHRIX_ROOT || path.resolve(__dirname, '..');
const hook = require('./build/api/stripe-webhook.js');
const { TOPUP_PACKAGES, PLANS } = require('./build/shared/payments.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const SECRET = 'whsec_t49_local_test_secret_not_a_real_key';

const mkRes = () => {
  const r = { code: null, body: null, ended: false };
  r.setHeader = () => {};
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  r.send = (b) => { r.body = b; r.ended = true; return r; };
  return r;
};

/** A request exactly as Vercel delivers it: the RAW body, plus the header. */
function signedReq(event, { secret = SECRET, timestamp, tamper } = {}) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return {
    method: 'POST',
    headers: { 'stripe-signature': header },
    rawBody: Buffer.from(tamper ? tamper(payload) : payload),
    query: {}, body: undefined,
  };
}

const topup = TOPUP_PACKAGES[0];
const plan = PLANS.find((p) => p.monthlyAcu > 0) || PLANS[0];

const EVENTS = {
  topup: {
    id: 'evt_topup_1', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', amount_total: topup.priceMinor, payment_intent: 'pi_1',
      metadata: { kind: 'acu_topup', packageId: topup.id, walletId: 'w_1' },
      customer_details: { email: 'buyer@example.com' } } },
  },
  /* The metadata lives where Stripe actually puts it for a subscription
     invoice — subscription_details — not at the top level. The first version of
     this fixture guessed, and the handler correctly routed it to
     `invoice_logged`: an invoice with no plan metadata is NOT a renewal, and
     crediting one would be inventing a subscription. */
  renewalPaid: {
    id: 'evt_inv_paid', type: 'invoice.paid',
    data: { object: { id: 'in_555', billing_reason: 'subscription_cycle', amount_paid: plan.monthlyMinor,
      subscription: 'sub_1', payment_intent: 'pi_sub_1',
      subscription_details: { metadata: { kind: 'plan_subscription', walletId: 'w_1', planId: plan.id } } } },
  },
  renewalSucceeded: {
    id: 'evt_inv_succeeded', type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_555', billing_reason: 'subscription_cycle', amount_paid: plan.monthlyMinor,
      subscription: 'sub_1', payment_intent: 'pi_sub_1',
      subscription_details: { metadata: { kind: 'plan_subscription', walletId: 'w_1', planId: plan.id } } } },
  },
  /* The FIRST invoice of a subscription must not credit here: checkout.session
     .completed already did it, and crediting both is a free month. */
  renewalFirst: {
    id: 'evt_inv_first', type: 'invoice.paid',
    data: { object: { id: 'in_first', billing_reason: 'subscription_create', amount_paid: plan.monthlyMinor,
      subscription: 'sub_1',
      subscription_details: { metadata: { kind: 'plan_subscription', walletId: 'w_1', planId: plan.id } } } },
  },
  /* An invoice with no plan metadata is not a renewal at all. */
  strayInvoice: {
    id: 'evt_inv_stray', type: 'invoice.paid',
    data: { object: { id: 'in_stray', billing_reason: 'subscription_cycle', amount_paid: 9999 } },
  },
  unknown: { id: 'evt_other', type: 'radar.early_fraud_warning.created', data: { object: {} } },
};

(async () => {
  const prevSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const prevDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;            // force the no_db path: no credit is applied

  console.log('\nTHE DOOR FAILS CLOSED');
  {
    /* THE ONE THAT MUST NEVER REGRESS. With no signing secret the endpoint must
       refuse, not accept. An endpoint that answers 200 without verifying is one
       where anyone who knows the URL can mint ACUs, and it looks healthy in
       every log while doing it. */
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = mkRes();
    await hook.default(signedReq(EVENTS.topup), res);
    t('with no STRIPE_WEBHOOK_SECRET it refuses with 503', res.code === 503, `HTTP ${res.code}`);
    t('and it does NOT report the event as received',
      !(res.body && res.body.received), JSON.stringify(res.body));

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res2 = mkRes();
    await hook.default({ method: 'GET', headers: {}, query: {} }, res2);
    t('a GET is 405, not a crash', res2.code === 405);
  }

  console.log('\nA GENUINE SIGNATURE IS ACCEPTED');
  {
    const res = mkRes();
    await hook.default(signedReq(EVENTS.topup), res);
    t('a correctly signed top-up is accepted', res.code === 200, `HTTP ${res.code} ${JSON.stringify(res.body)}`);
    t('and reports no_db rather than pretending to have credited anything',
      res.body && res.body.persisted === 'no_db', JSON.stringify(res.body));
  }

  console.log('\nEVERY FORGED VARIANT IS REFUSED');
  {
    /* Each case below is a request an attacker can actually make. */
    const cases = [
      ['a tampered body with a valid signature for the ORIGINAL',
        signedReq(EVENTS.topup, { tamper: (p) => p.replace(/"amount_total":\d+/, '"amount_total":999999') })],
      ['a payload signed with a DIFFERENT secret',
        signedReq(EVENTS.topup, { secret: 'whsec_attacker_secret_value_here' })],
      ['a signature older than Stripe\'s tolerance (replay)',
        signedReq(EVENTS.topup, { timestamp: Math.floor(Date.now() / 1000) - 60 * 60 })],
      ['no signature header at all',
        { method: 'POST', headers: {}, rawBody: Buffer.from(JSON.stringify(EVENTS.topup)), query: {} }],
      ['a garbage signature header',
        { method: 'POST', headers: { 'stripe-signature': 't=1,v1=deadbeef' }, rawBody: Buffer.from(JSON.stringify(EVENTS.topup)), query: {} }],
      ['an empty body with a signature for something else',
        { method: 'POST', headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: '{}', secret: SECRET }) },
          rawBody: Buffer.from(JSON.stringify(EVENTS.topup)), query: {} }],
    ];
    for (const [name, req] of cases) {
      const res = mkRes();
      await hook.default(req, res);
      t(`${name} → 400`, res.code === 400, `HTTP ${res.code} ${JSON.stringify(res.body)}`);
      t(`${name} → nothing received`, !(res.body && res.body.received));
    }
  }

  console.log('\nTHE SIGNATURE ERROR MUST NOT TEACH AN ATTACKER ANYTHING');
  {
    const res = mkRes();
    await hook.default(signedReq(EVENTS.topup, { secret: 'whsec_attacker_secret_value_here' }), res);
    const body = JSON.stringify(res.body);
    t('the refusal does not echo the configured secret', !body.includes(SECRET), body);
    t('nor a stack trace or a file path', !/\/home\/|\/var\/task|at Object\.|node_modules/.test(body), body);
  }

  console.log('\nROUTING: the eight events that matter, and everything else ignored');
  {
    /* handleStripeEvent is the shared router, so this is the decision itself
       rather than a reading of the switch. */
    const topupResult = hook.handleStripeEvent(EVENTS.topup);
    t('a top-up routes to credit_acu', topupResult.action === 'credit_acu', JSON.stringify(topupResult));
    t('and carries the package\'s ACU amount, not a client-supplied one',
      topupResult.acu === topup.acu, `${topupResult.acu} vs ${topup.acu}`);

    const ignored = hook.handleStripeEvent(EVENTS.unknown);
    t('an event type the platform does not handle is IGNORED, not an error',
      ignored.ok === true && ignored.action === 'ignored', JSON.stringify(ignored));

    /* THE DOUBLE-CREDIT BUG, at the level this test can reach. Stripe fires
       invoice.paid AND invoice.payment_succeeded for one renewal, with a
       different event id each, so idempotency keyed on the event id cannot
       dedupe them. Both must therefore report the SAME invoice id, because that
       is what the credit is claimed against. */
    const a = hook.handleStripeEvent(EVENTS.renewalPaid);
    const b = hook.handleStripeEvent(EVENTS.renewalSucceeded);
    t('both renewal events route to plan_renewed',
      a.action === 'plan_renewed' && b.action === 'plan_renewed', `${a.action} / ${b.action}`);
    t('they arrive with DIFFERENT event ids',
      EVENTS.renewalPaid.id !== EVENTS.renewalSucceeded.id);
    t('but both carry the SAME invoice id, which is what the credit is claimed against',
      a.invoiceId === 'in_555' && b.invoiceId === 'in_555', `${a.invoiceId} / ${b.invoiceId}`);
    t('the renewal carries the invoice AMOUNT, not just the metadata label',
      a.amountPaidMinor === plan.monthlyMinor,
      'metadata planId is stamped at creation and never updated; the amount is the fact');

    const first = hook.handleStripeEvent(EVENTS.renewalFirst);
    t('the FIRST invoice of a subscription does not credit again',
      first.action === 'invoice_logged', JSON.stringify(first));
    const stray = hook.handleStripeEvent(EVENTS.strayInvoice);
    t('an invoice with no plan metadata is not treated as a renewal',
      stray.action === 'invoice_logged', JSON.stringify(stray));
  }

  console.log('\nMONEY THAT DID NOT ARRIVE IS NOT CREDITED');
  {
    /* grantCheck is why a £0 session cannot mint ACUs. Driven through the real
       handler so the guard is exercised where it actually runs. */
    const zero = JSON.parse(JSON.stringify(EVENTS.topup));
    zero.id = 'evt_topup_zero';
    zero.data.object.amount_total = 0;
    const res = mkRes();
    await hook.default(signedReq(zero), res);
    t('a £0 settled top-up is still accepted by Stripe\'s contract', res.code === 200, `HTTP ${res.code}`);
    /* With no database the handler cannot reach the grant decision, so this
       asserts the routing's own amount instead of claiming more than it knows. */
    const routed = hook.handleStripeEvent(zero);
    t('and the amount the grant check compares against comes from the PACKAGE',
      routed.amountMinor === topup.priceMinor, `${routed.amountMinor} vs ${topup.priceMinor}`);
  }

  console.log('\nTHE RECOVERY DRILL REFUSES THE DANGEROUS THING');
  {
    /* tools/restore-drill.mjs points a firehose at a database, so its refusals
       matter more than its happy path. Those refusals need no database: they
       happen before anything is opened, which is exactly why they can be tested
       here. The drill's successful path was verified against a real PostgreSQL
       16 cluster and is recorded in launch-audit/evidence-ledger.md. */
    const { spawnSync } = require('child_process');
    const drill = path.join(ROOT, 'tools/restore-drill.mjs');
    t('the drill exists', fs.existsSync(drill));

    const run = (args) => spawnSync(process.execPath, [drill, ...args], { encoding: 'utf8' });

    const noArgs = run([]);
    t('with no arguments it prints usage and exits non-zero',
      noArgs.status !== 0 && /--into/.test(noArgs.stdout + noArgs.stderr),
      `exit ${noArgs.status}`);

    const same = run(['--source', 'postgresql://x@h/db', '--into', 'postgresql://x@h/db']);
    t('it refuses to restore over the source',
      same.status === 1 && /same database as --source/.test(same.stderr + same.stdout),
      `exit ${same.status}: ${(same.stderr || same.stdout).slice(0, 120)}`);

    const noTarget = run(['--source', 'postgresql://x@h/db']);
    t('it refuses without an explicit target — there is no default',
      noTarget.status !== 0,
      'a recovery tool with a default target is a recovery tool that overwrites the wrong database once');

    const src = fs.readFileSync(drill, 'utf8');
    t('a non-empty target needs --force-overwrite',
      /--force-overwrite if you are certain/.test(src) && /targetTables && !force/.test(src));
    t('connection strings are redacted in its output',
      (src.match(/<redacted>@/g) || []).length >= 2,
      'both the source and the target are printed, and a drill that puts a password in a terminal log has leaked it');
    t('it verifies the double-entry invariant, not just row counts',
      /sum\(delta_minor\) <> 0/.test(src),
      'a restore that brings back rows but breaks the ledger has restored a pile of numbers');
    t('and it distinguishes a pre-existing ledger fault from one the restore caused',
      /introduced by the restore/.test(src) && /a LEDGER fault, not a restore fault/.test(src),
      'the first version blamed the backup for a fault the backup had faithfully preserved');
    t('it reports a MEASURED RTO, which is what the runbook needs',
      /MEASURED RTO/.test(src));
    t('and it never writes to the source',
      !/INSERT INTO|UPDATE |DELETE FROM|DROP /.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
      'the drill reads the source and writes only to the target');
  }

  if (prevSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = prevSecret;
  if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

/**
 * THE STRIPE WEBHOOK MUST BE REACHABLE AT THE URL STRIPE ACTUALLY POSTS TO.
 *
 * On 25 Aug the Stripe dashboard showed 246 events at 100% failure against
 * https://www.joshrix.com/v1/payments/stripe-webhook — a path nothing in this
 * repo serves. The handler is api/stripe-webhook.ts, which Vercel exposes at
 * /api/stripe-webhook, and no rewrite joined the two. Every settlement event
 * since the endpoint was created had 404'd: no ACUs credited, no plans
 * activated, no entitlements granted, no earnings paid.
 *
 * Nothing caught it because nothing tested it. The whole money system is
 * downstream of one URL, and that URL lived only in a dashboard nobody diffs.
 *
 * This asserts the join: every rewrite points at a file that exists, and the
 * webhook is reachable at the path Stripe is configured with.
 *
 *   node tests/t31-webhook-route.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = vercel.rewrites || [];

/* The URL configured in Stripe. If this is ever changed there, change it here
   in the same breath — that is the entire point of this file. */
const STRIPE_POSTS_TO = '/v1/payments/stripe-webhook';
const HANDLER = '/api/stripe-webhook';

console.log('\nthe webhook URL resolves to the handler');
{
  const hit = rewrites.find((r) => r.source === STRIPE_POSTS_TO);
  t(`${STRIPE_POSTS_TO} is routed at all`, !!hit,
    'nothing serves it — Stripe would get a 404 for every event');
  t('and it routes to the webhook handler', !!hit && hit.destination === HANDLER,
    hit ? hit.destination : 'no rewrite');
  t('the handler file exists', fs.existsSync(path.join(ROOT, 'api/stripe-webhook.ts')));
}

console.log('\nthe handler is a real signature-verifying endpoint');
{
  const src = fs.readFileSync(path.join(ROOT, 'api/stripe-webhook.ts'), 'utf8');
  t('it verifies the Stripe signature', src.includes('constructEvent'));
  t('it reads the RAW body (a parsed body cannot be verified)',
    src.includes('bodyParser: false'));
  t('it refuses to run without a signing secret',
    src.includes('STRIPE_WEBHOOK_SECRET'));
  // Each Stripe endpoint has its OWN signing secret. Pointing the URL at the
  // right place with the wrong secret fails exactly as loudly as a 404 does,
  // and the two are only told apart by the response Stripe records.
  t('a bad signature answers 400, so Stripe records it as an error',
    /verification failed/i.test(src) && src.includes('400'));
  t('a missing secret answers 503 rather than silently accepting',
    src.includes('503'));
}

console.log('\nevery rewrite points at something that exists');
{
  for (const r of rewrites) {
    if (!String(r.destination).startsWith('/api/')) continue;
    const name = String(r.destination).replace(/^\/api\//, '').split('?')[0];
    t(`${r.source} -> api/${name}.ts exists`, fs.existsSync(path.join(ROOT, 'api', name + '.ts')));
  }
}

console.log('\nthe events the money code depends on are all handled');
{
  const src = fs.readFileSync(path.join(ROOT, 'api/stripe-webhook.ts'), 'utf8');
  // Each of these is handled in code; if it is not ALSO enabled in the Stripe
  // dashboard the handler never runs, and the leak it closes stays open.
  const NEEDED = [
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'charge.refunded',
  ];
  for (const ev of NEEDED) t(`${ev} is handled`, src.includes(ev));
}


/* =========================================================================
 * ONE RENEWAL IS ONE CREDIT, HOWEVER MANY EVENTS DESCRIBE IT.
 *
 * Stripe fires BOTH invoice.paid and invoice.payment_succeeded for a single
 * subscription renewal, each with its own event id. The webhook's idempotency
 * was claimEvent(event.id), which dedupes a RETRY of one event and cannot
 * dedupe two different events about one invoice — so with both subscribed, a
 * renewal credited a month's ACUs twice.
 *
 * Found on 7 Nov 2026 when Justin reported the endpoint failing after
 * selecting all 238 events in the dashboard. Selecting everything did not
 * cause the failure, but it did turn this latent bug live.
 *
 * The guard is a claim on the INVOICE id. Asserted here rather than left to
 * the dashboard configuration, because "do not tick that box" is not a
 * control: anyone re-selecting events would reintroduce it silently, and the
 * symptom is a wallet with too many ACUs, which nobody reports.
 * ========================================================================= */
console.log('\none renewal credits once, whichever invoice event arrives');
{
  const wh = fs.readFileSync(path.join(ROOT, 'api/stripe-webhook.ts'), 'utf8');
  /* Comments here necessarily describe the bug; judge the code. */
  const code = wh.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  t('both invoice events are still handled',
    /case "invoice\.paid":/.test(code) && /case "invoice\.payment_succeeded":/.test(code),
    'dropping one would work until Stripe changed which it sends');
  t('the renewal carries the invoice id, not just the event id',
    /invoiceId:\s*typeof inv\.id === "string"/.test(code),
    'the invoice is the thing that was paid; the event is not');
  t('the credit is claimed against the INVOICE before it is granted',
    /claimEvent\(sql,\s*`renewal:\$\{invoiceId\}`/.test(code),
    'without this, two events for one invoice credit twice');
  /* Scoped to the RENEWAL branch. The same creditWallet call also appears in
     the first-month path under checkout.session.completed, which is a single
     event type and needs no invoice guard — an unscoped search finds that one
     first and the ordering check passes or fails for the wrong reason. */
  /* Anchored on where the action is APPLIED, not where it is returned: the
     switch returns "plan_renewed" long before the handler acts on it, and a
     slice from the return still contains the first-month credit. */
  const renewal = code.slice(code.indexOf('action === "plan_renewed"'));
  t('the claim is checked before creditWallet runs, inside the renewal branch',
    renewal.indexOf('firstForInvoice') > -1 &&
    renewal.indexOf('firstForInvoice') < renewal.indexOf('await creditWallet(sql, wid, plan.monthlyAcu)'),
    'claiming after crediting guards nothing');
  t('a second event for the same invoice is logged, not silently dropped',
    /renewalAlreadyCredited/.test(code),
    'a skipped credit must be visible or a real missed grant looks identical');
  /* An invoice with no id must still credit: a customer who paid is owed the
     grant, and the event-level guard still prevents a retry double-credit. */
  t('an invoice with no id falls back rather than skipping the grant',
    /invoiceId\s*\n?\s*\?\s*await claimEvent|:\s*true;/.test(code),
    'failing closed here would withhold ACUs from someone who paid');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

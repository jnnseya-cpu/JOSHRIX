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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

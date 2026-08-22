/**
 * PUTTING A WORLD ON SALE.
 *
 * /api/checkout has always read the price from the listing rather than the
 * buyer's request — correct, and useless, because nothing ever wrote a price.
 * Every game answered "This world has no valid sale price set by its creator".
 * /api/listing is the half that was missing, so this file tests the two things
 * that decide whether it is safe:
 *
 *   1. can a creator price a game that is not theirs?      (no — 404, unchanged)
 *   2. can a client choose its own commission rate?        (no — read from the wallet)
 *
 * and then proves the join: a game priced here is a game checkout will sell.
 *
 *   node tests/t24-listing.js
 */
const led = require('./build/api/_ledger.js');
const pay = require('./build/shared/payments.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const wallets = new Map();
const games = new Map();

const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();
  if (/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/i.test(q)) return Promise.resolve([]);

  if (/FROM wallets WHERE id = \?/i.test(q)) {
    const w = wallets.get(vals[0]); return Promise.resolve(w ? [w] : []);
  }
  // the authorisation IS the WHERE clause — model it exactly
  if (/^UPDATE games SET price_minor/i.test(q)) {
    const [price, plan, id, wallet] = vals;
    const g = games.get(id);
    if (!g || g.creator_wallet !== wallet) return Promise.resolve([]);
    g.price_minor = price; g.seller_plan = plan;
    return Promise.resolve([{ id: g.id }]);
  }
  if (/FROM games WHERE id = \?/i.test(q)) {
    const g = games.get(vals[0]); return Promise.resolve(g ? [g] : []);
  }
  return Promise.resolve([]);       // rate-limit bookkeeping
};

led.__setDbForTests(fake);
const listing = require('./build/api/listing.js').default;
const checkout = require('./build/api/checkout.js').default;

const mkRes = () => { const r = { code: null, body: null };
  r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };
const post = async (h, body) => { const res = mkRes(); await h({ method: 'POST', headers: {}, body, query: {} }, res); return res; };

const W = 'w-creator000000', OTHER = 'w-stranger00000', FREE = 'w-explorer00000';
const G = 'g-reef-abc1234567';

function reset() {
  wallets.clear(); games.clear();
  wallets.set(W, { id: W, balance: 0, category: 'standard', email: 'c@x.com', plan: 'creator' });
  wallets.set(OTHER, { id: OTHER, balance: 0, category: 'standard', email: 's@x.com', plan: 'studio' });
  wallets.set(FREE, { id: FREE, balance: 0, category: 'standard', email: 'e@x.com', plan: 'explorer' });
  games.set(G, { id: G, title: 'Reef', status: 'approved', price_minor: null, seller_plan: null, creator_wallet: W, creator_email: 'c@x.com' });
}

(async () => {

console.log('\n== a creator prices their own world ==');
{
  reset();
  const r = await post(listing, { walletId: W, gameId: G, priceMinor: 499 });
  t('accepted', r.code === 200 && r.body.listed === true, JSON.stringify(r.body));
  t('the price is stored on the listing, not echoed', games.get(G).price_minor === 499);
  t('the seller tier is stored with it', games.get(G).seller_plan === 'creator');

  const split = pay.marketplaceSplit({ grossMinor: 499, method: 'card', sellerPlan: 'creator' });
  t('what they are told they keep is what the payment engine computes',
    r.body.youKeepMinor === split.creatorMinor && r.body.commissionMinor === split.commissionMinor,
    `told ${r.body.youKeepMinor}, engine ${split.creatorMinor}`);
  t('commission matches their plan, not a default', r.body.commissionRate === 0.25);
}

console.log('\n== the commission rate cannot be chosen by the client ==');
{
  reset();
  // A hostile client asks to be billed at the cheapest tier it knows of.
  const r = await post(listing, { walletId: W, gameId: G, priceMinor: 10_000, sellerPlan: 'enterprise', commission: 0 });
  t('the request\'s sellerPlan is ignored', games.get(G).seller_plan === 'creator',
    'a client-supplied plan is a client-supplied discount');
  t('and the quoted rate is the wallet\'s', r.body.commissionRate === 0.25);
}

console.log('\n== a world can only be priced by the wallet that made it ==');
{
  reset();
  const r = await post(listing, { walletId: OTHER, gameId: G, priceMinor: 100 });
  t('a stranger is refused', r.code === 404);
  t('and the listing is untouched', games.get(G).price_minor === null,
    'otherwise anyone who guesses a game id can price someone else\'s work');
  t('the refusal does not confirm the game exists',
    !/exists|approved|Reef/i.test(r.body.error || ''), r.body.error);
}

console.log('\n== the free tier cannot sell, and is told why ==');
{
  reset();
  games.get(G).creator_wallet = FREE;
  const r = await post(listing, { walletId: FREE, gameId: G, priceMinor: 499 });
  t('refused with 403', r.code === 403);
  t('no price is written', games.get(G).price_minor === null,
    'a stored price on a plan that cannot sell would be sold by checkout anyway');
  t('it names the plan and where to change it', /plan/i.test(r.body.error) && r.body.href === '/pricing');
  t('this matches PLANS, not a hardcoded list',
    pay.PLANS.find((p) => p.id === 'explorer').commission === null);
}

console.log('\n== prices that would pay the creator nothing are refused ==');
{
  reset();
  for (const bad of [1, 25, 49, -100, 4.5, 10_000_001, '499', NaN]) {
    const r = await post(listing, { walletId: W, gameId: G, priceMinor: bad });
    t(`${JSON.stringify(bad)} refused`, r.code === 400, `code ${r.code}`);
  }
  t('nothing was written by any of them', games.get(G).price_minor === null);
  const ok = await post(listing, { walletId: W, gameId: G, priceMinor: pay.MIN_LISTING_PRICE_MINOR });
  t(`exactly the floor (${pay.MIN_LISTING_PRICE_MINOR}p) is allowed`, ok.code === 200);
}

console.log('\n== unlisting ==');
{
  reset();
  await post(listing, { walletId: W, gameId: G, priceMinor: 499 });
  const r = await post(listing, { walletId: W, gameId: G, priceMinor: null });
  t('clearing the price unlists it', r.code === 200 && r.body.listed === false);
  t('the price really is gone', games.get(G).price_minor === null);
  t('the game itself survives', games.has(G), 'unlisting must never delete a creator\'s work');
  const zero = await post(listing, { walletId: W, gameId: G, priceMinor: 0 });
  t('zero unlists too rather than selling for nothing', zero.body.listed === false);
}

console.log('\n== a pending game may be priced but is not on sale ==');
{
  reset();
  games.get(G).status = 'pending_review';
  const r = await post(listing, { walletId: W, gameId: G, priceMinor: 499 });
  t('pricing is allowed before approval', r.code === 200);
  t('but the creator is told it is not live yet', /moderation/i.test(r.body.note), r.body.note);
}

console.log('\n== the join: a priced world is one checkout will sell ==');
{
  reset();
  const before = await post(checkout, { listingId: G, method: 'card' });
  t('unpriced -> checkout refuses', before.code === 409 && /no valid sale price/i.test(before.body.error),
    'this was the state of EVERY game on the platform');

  await post(listing, { walletId: W, gameId: G, priceMinor: 499 });
  const after = await post(checkout, { listingId: G, method: 'card' });
  t('priced -> checkout gets past the price gate', after.code !== 409,
    `still refusing: ${JSON.stringify(after.body)}`);
  t('and stops only because Stripe is not configured in this test',
    after.code === 503 && /STRIPE_SECRET_KEY/i.test(after.body.error || ''), JSON.stringify(after.body));
}

console.log('\n== malformed identifiers never reach the database ==');
{
  reset();
  for (const [w, g] of [['nope', G], [W, '<img src=x>'], ['', G], [W, ''], ['w-' + 'a'.repeat(60), G]]) {
    const r = await post(listing, { walletId: w, gameId: g, priceMinor: 499 });
    t(`walletId=${JSON.stringify(String(w).slice(0, 14))} gameId=${JSON.stringify(String(g).slice(0, 14))} -> 400`, r.code === 400, `code ${r.code}`);
  }
  t('and nothing was written', games.get(G).price_minor === null);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();

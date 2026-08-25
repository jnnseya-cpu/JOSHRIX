/**
 * THE PAYWALL, AT THE ENDPOINTS.
 *
 * t29 proves the ledger primitives. This drives the real handlers, because the
 * leaks were never in the primitives — hasEntitlement() had been correct and
 * unused since the marketplace shipped, while /api/game-html handed every paid
 * world to anyone who opened its public URL.
 *
 * Three questions, each of which was answered wrongly in production:
 *   1. does a paid world play without being bought?          (it did)
 *   2. does a refunded build publish for free?                (it did)
 *   3. can a lapsed subscriber keep selling?                  (they could)
 *
 *   node tests/t30-paywall.js
 */
const led = require('./build/api/_ledger.js');
const pay = require('./build/shared/payments.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const wallets = new Map(), games = new Map(), ents = [], charges = [];

const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();
  if (/^CREATE |^ALTER /i.test(q)) return Promise.resolve([]);

  if (q.includes('FROM wallets WHERE id = ?')) {
    const w = wallets.get(vals[0]); return Promise.resolve(w ? [{ ...w }] : []);
  }
  if (q.includes('UPDATE wallets SET balance = balance - ')) {
    const w = wallets.get(vals[1]);
    if (!w || w.balance < vals[0]) return Promise.resolve([]);
    w.balance -= vals[0]; return Promise.resolve([{ balance: w.balance }]);
  }
  if (q.includes('UPDATE wallets SET balance = balance + ')) {
    const w = wallets.get(vals[1]);
    if (!w) return Promise.resolve([]);
    w.balance += vals[0]; return Promise.resolve([{ balance: w.balance }]);
  }
  if (q.includes('FROM games WHERE id = ?')) {
    const g = games.get(vals[0]); return Promise.resolve(g ? [{ ...g }] : []);
  }
  if (q.includes('INSERT INTO games')) {
    const [id, title, summary, language, html, creator_wallet, creator_email] = vals;
    if (!games.has(id)) games.set(id, { id, title, summary, language, html, creator_wallet, creator_email, status: 'pending_review', plays: 0, price_minor: null, seller_plan: null, created_at: new Date().toISOString() });
    return Promise.resolve([]);
  }
  if (q.includes('SELECT count(*) AS n FROM games')) return Promise.resolve([{ n: 0 }]);
  if (q.includes('UPDATE games SET plays = plays + 1')) {
    const g = games.get(vals[0]); if (g) g.plays++; return Promise.resolve([]);
  }
  if (q.includes('SELECT id FROM entitlements')) {
    const e = ents.find((x) => x.game_id === vals[0] && x.buyer_wallet === vals[1] && !x.revoked_at);
    return Promise.resolve(e ? [{ id: e.id }] : []);
  }
  // forge charges — same guards as Postgres
  if (q.includes('INSERT INTO forge_charges')) {
    const [id, wallet_id, amount, settle_amount] = vals;
    if (!charges.some((c) => c.id === id)) charges.push({ id, wallet_id, amount, settle_amount, accepted_at: null, refunded_at: null });
    return Promise.resolve([]);
  }
  if (q.includes('SELECT id, amount, COALESCE(settle_amount, amount)')) {
    const c = charges.find((x) => x.id === vals[0] && x.wallet_id === vals[1]);
    return Promise.resolve(c ? [{ id: c.id, amount: c.amount, settle_amount: c.settle_amount ?? c.amount, accepted_at: c.accepted_at, refunded_at: c.refunded_at }] : []);
  }
  if (q.includes('SET accepted_at = now(), refunded_at = NULL')) {
    const c = charges.find((x) => x.id === vals[0] && x.wallet_id === vals[1] && !x.accepted_at && x.refunded_at);
    if (!c) return Promise.resolve([]);
    c.accepted_at = Date.now(); c.refunded_at = null; return Promise.resolve([{ id: c.id }]);
  }
  if (q.includes('SET accepted_at = now()')) {
    const c = charges.find((x) => x.id === vals[0] && x.wallet_id === vals[1] && !x.accepted_at && !x.refunded_at);
    if (!c) return Promise.resolve([]);
    c.accepted_at = Date.now();
    return Promise.resolve([{ amount: c.amount, settle_amount: c.settle_amount ?? c.amount }]);
  }
  if (q.includes('SET refunded_at = now()')) {
    const c = charges.find((x) => x.id === vals[0] && x.wallet_id === vals[1] && !x.refunded_at && !x.accepted_at);
    if (!c) return Promise.resolve([]);
    c.refunded_at = Date.now(); return Promise.resolve([{ amount: c.amount }]);
  }
  return Promise.resolve([]);
};

led.__setDbForTests(fake);
const gameHtml = require('./build/api/game-html.js').default;
const games_h = require('./build/api/games.js').default;
const checkout = require('./build/api/checkout.js').default;

const mkRes = () => { const r = { code: null, body: null };
  r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };
const get = async (h, query, headers = {}) => { const res = mkRes(); await h({ method: 'GET', headers, query }, res); return res; };
const post = async (h, body) => { const res = mkRes(); await h({ method: 'POST', headers: {}, body, query: {} }, res); return res; };

const CREATOR = 'w-creator000000', BUYER = 'w-buyer0000000', STRANGER = 'w-stranger00000';
const HTML = '<!doctype html><html><body><canvas id="c"></canvas><script>1</script></body></html>';

function reset() {
  wallets.clear(); games.clear(); ents.length = 0; charges.length = 0;
  wallets.set(CREATOR, { id: CREATOR, balance: 5000, category: 'purchased', email: null, name: null, plan: 'studio' });
  wallets.set(BUYER, { id: BUYER, balance: 0, category: 'standard', email: null, name: null, plan: 'explorer' });
  wallets.set(STRANGER, { id: STRANGER, balance: 0, category: 'standard', email: null, name: null, plan: 'explorer' });
}

const mkGame = (id, over = {}) => {
  games.set(id, { id, title: 'World', summary: null, language: null, html: HTML, status: 'approved',
    creator_wallet: CREATOR, creator_email: null, plays: 0, price_minor: null, seller_plan: null,
    created_at: new Date().toISOString(), ...over });
};

(async () => {

/* ================================================================= *
 * 1. A paid world does not play for free.
 * ================================================================= */
console.log('\na priced world is served only to someone who owns it');
{
  reset();
  mkGame('g-free-aaaaaaaaaa');
  mkGame('g-paid-bbbbbbbbbb', { price_minor: 2000, seller_plan: 'studio' });

  const free = await get(gameHtml, { id: 'g-free-aaaaaaaaaa' });
  t('a FREE approved world still plays for anyone', !!free.body.html && !free.body.locked);

  const anon = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb' });
  t('a PAID world sends no html to an anonymous visitor', !anon.body.html, JSON.stringify(anon.body).slice(0, 90));
  t('and says it is locked', anon.body.locked === true);
  t('and quotes the price so the page can sell it', anon.body.priceMinor === 2000);
  t('and points at somewhere to buy it', typeof anon.body.buyUrl === 'string' && anon.body.buyUrl.includes('g-paid'));

  const stranger = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb', w: STRANGER });
  t('a signed-in stranger gets no html either', !stranger.body.html && stranger.body.locked === true);

  const creator = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb', w: CREATOR });
  t('the creator plays their own paid world', !!creator.body.html && !creator.body.locked);

  ents.push({ id: 'e1', game_id: 'g-paid-bbbbbbbbbb', buyer_wallet: BUYER, revoked_at: null });
  const buyer = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb', w: BUYER });
  t('a buyer who owns it plays it', !!buyer.body.html);

  ents[0].revoked_at = Date.now();
  const refunded = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb', w: BUYER });
  t('a buyer who charged back loses it again', !refunded.body.html && refunded.body.locked === true);

  const admin = await get(gameHtml, { id: 'g-paid-bbbbbbbbbb' }, { 'x-admin-key': process.env.MODERATION_KEY || '' });
  t('moderation is not blocked by the paywall when a key is set',
    process.env.MODERATION_KEY ? !!admin.body.html : !admin.body.html);
}

/* ================================================================= *
 * 2. Unapproved html reaches its creator and nobody else.
 * ================================================================= */
console.log('\nunapproved builds do not leak');
{
  reset();
  mkGame('g-pend-cccccccccc', { status: 'pending_review' });
  mkGame('g-orph-dddddddddd', { status: 'pending_review', creator_wallet: null });

  t('the creator previews their own', !!(await get(gameHtml, { id: 'g-pend-cccccccccc', preview: '1', w: CREATOR })).body.html);
  t('a stranger cannot', !(await get(gameHtml, { id: 'g-pend-cccccccccc', preview: '1', w: STRANGER })).body.html);
  t('nor can an anonymous visitor', !(await get(gameHtml, { id: 'g-pend-cccccccccc', preview: '1' })).body.html);
  // the old predicate began `!game.creator_wallet ||`, so an ownerless game
  // previewed for anybody who guessed its id
  t('a game with NO creator wallet does not preview for a stranger',
    !(await get(gameHtml, { id: 'g-orph-dddddddddd', preview: '1', w: STRANGER })).body.html);
  t('nor anonymously', !(await get(gameHtml, { id: 'g-orph-dddddddddd', preview: '1' })).body.html);
  t('and preview=0 never serves an unapproved build', !(await get(gameHtml, { id: 'g-pend-cccccccccc', w: CREATOR })).body.html);
}

/* ================================================================= *
 * 3. Publishing always pays for the forge.
 * ================================================================= */
console.log('\npublishing collects, or it does not publish');
{
  reset();
  const body = (over = {}) => ({ title: 'My World', html: HTML, walletId: CREATOR, ...over });

  // no forge link at all — was a free publish
  const unlinked = await post(games_h, body());
  t('a publish with no forge run is refused', unlinked.code === 402 && unlinked.body.code === 'forge_unlinked');
  t('and no game was hosted', games.size === 0);

  // a forge run belonging to someone else
  await led.recordForgeHold(fake, 'f-other', STRANGER, 250, 60);
  const stolen = await post(games_h, body({ forgeId: 'f-other' }));
  t("another wallet's forge run cannot be published from here", stolen.code === 402 && stolen.body.code === 'forge_unknown');
  t('and still nothing was hosted', games.size === 0);

  // the honest path
  reset();
  await led.recordForgeHold(fake, 'f-ok', CREATOR, 250, 60);
  await led.debitWallet(fake, CREATOR, 250);
  const ok = await post(games_h, body({ forgeId: 'f-ok' }));
  t('an unrefunded build publishes', ok.code === 200 && !!ok.body.id);
  t('and settles to what the run cost', ok.body.acuCharged === 60);
  t('handing back the rest of the hold', ok.body.acuRefunded === 190);
  t('so the creator paid exactly the settle amount', wallets.get(CREATOR).balance === 5000 - 60);

  // THE LEAK: claim the render-failure refund, then publish anyway
  reset();
  await led.recordForgeHold(fake, 'f-cheat', CREATOR, 250, 60);
  await led.debitWallet(fake, CREATOR, 250);
  const back = await led.claimForgeRefund(fake, 'f-cheat', CREATOR);
  await led.creditWallet(fake, CREATOR, back);
  t('the refund returned the whole hold', wallets.get(CREATOR).balance === 5000);
  const cheat = await post(games_h, body({ forgeId: 'f-cheat' }));
  t('publishing a refunded build still succeeds for the creator', cheat.code === 200);
  t('but it is charged for', cheat.body.acuCharged === 60 && wallets.get(CREATOR).balance === 4940);

  // and refused outright when they cannot pay
  reset();
  wallets.get(CREATOR).balance = 250;
  await led.recordForgeHold(fake, 'f-broke', CREATOR, 250, 60);
  await led.debitWallet(fake, CREATOR, 250);
  const r = await led.claimForgeRefund(fake, 'f-broke', CREATOR);
  await led.creditWallet(fake, CREATOR, r);
  await led.debitWallet(fake, CREATOR, 250);                 // spent elsewhere
  const broke = await post(games_h, body({ forgeId: 'f-broke' }));
  t('a refunded build cannot be published on credit', broke.code === 402 && broke.body.code === 'forge_refunded_unpaid');
  t('the shortfall is named', broke.body.acuRequired === 60);
  t('and nothing was hosted', games.size === 0);
  t('and the wallet was not driven negative', wallets.get(CREATOR).balance === 0);
}

/* ================================================================= *
 * 4. Selling requires a live plan, and not to yourself.
 * ================================================================= */
console.log('\nselling requires a plan you are still paying for');
{
  reset();
  mkGame('g-sale-eeeeeeeeee', { price_minor: 2000, seller_plan: 'studio' });

  wallets.get(CREATOR).plan = 'explorer';               // the subscription lapsed
  const lapsed = await post(checkout, { listingId: 'g-sale-eeeeeeeeee', method: 'card', buyerWalletId: BUYER });
  t('a lapsed seller\'s world stops selling', lapsed.code === 409, JSON.stringify(lapsed.body).slice(0, 80));

  wallets.get(CREATOR).plan = 'studio';
  const self = await post(checkout, { listingId: 'g-sale-eeeeeeeeee', method: 'card', buyerWalletId: CREATOR });
  t('nobody can buy their own listing', self.code === 409);

  // With no Stripe key the handler stops at the 503 — which is AFTER both
  // guards above, so reaching it proves they let a legitimate sale through.
  const good = await post(checkout, { listingId: 'g-sale-eeeeeeeeee', method: 'card', buyerWalletId: BUYER });
  t('a real buyer with a subscribed seller gets past the guards',
    good.code === 503 || good.code === 200, String(good.code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();

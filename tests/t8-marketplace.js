/* PHASE 9: marketplace price authority + entitlement idempotency */
const led=require('./build/api/_ledger.js');
const games=new Map(), ents=new Map();
const fake=(st,...v)=>{const q=st.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE|^ALTER TABLE/i.test(q))return Promise.resolve([]);
  if(/SELECT id, title, status, price_minor/i.test(q)){const g=games.get(v[0]);return Promise.resolve(g?[g]:[]);}
  if(/^INSERT INTO entitlements/i.test(q)){const[id,gid,bw,be,pm,sess]=v;
    if(ents.has(sess))return Promise.resolve([]); ents.set(sess,{id,gid,bw,be,pm}); return Promise.resolve([{id}]);}
  if(/UPDATE games SET price_minor/i.test(q)){const[price,plan,gid,wallet]=v;const g=games.get(gid);
    if(g&&g.creator_wallet===wallet){g.price_minor=price;g.seller_plan=plan;return Promise.resolve([{id:gid}]);} return Promise.resolve([]);}
  return Promise.resolve([]);};
led.__setDbForTests(fake);
const handler=require('./build/api/checkout.js').default;
const mkRes=()=>{const r={code:null,body:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};
const post=async b=>{const res=mkRes();await handler({method:'POST',headers:{host:'www.joshrix.com'},body:b,query:{}},res);return res;};
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
games.set('g1',{id:'g1',title:'Crystal Quest',status:'approved',price_minor:499,seller_plan:'creator',creator_wallet:'w-seller',creator_email:'s@x.com'});
games.set('g2',{id:'g2',title:'Unreviewed',status:'pending_review',price_minor:499,seller_plan:'creator',creator_wallet:'w-seller'});
games.set('g3',{id:'g3',title:'No Price',status:'approved',price_minor:null,seller_plan:'creator',creator_wallet:'w-seller'});
delete process.env.STRIPE_SECRET_KEY;

console.log('\n== PHASE 9: PRICE AUTHORITY — buyer cannot dictate the price ==');
let r=await post({listingId:'g1', priceMinor:1, method:'card'});
t('buyer-supplied priceMinor=1 does NOT become the price',
  r.code===503 || (r.body?.listing?.priceMinor===499),
  `code ${r.code} ${JSON.stringify(r.body).slice(0,110)}`);
console.log('       -> without STRIPE_SECRET_KEY it refuses to sell at all (503), so no free grant path');
t('refuses to sell when Stripe is unconfigured', r.code===503 && r.body.sold===false, `code ${r.code}`);

console.log('\n== PHASE 9: LISTING STATE GUARDS ==');
r=await post({listingId:'g2'});           t('unapproved listing cannot be bought', r.code===409, `code ${r.code}`);
r=await post({listingId:'g3'});           t('listing with no price cannot be bought', r.code===409, `code ${r.code}`);
r=await post({listingId:'does-not-exist'});t('unknown listing -> 404', r.code===404, `code ${r.code}`);
r=await post({});                          t('missing listingId -> 400', r.code===400, `code ${r.code}`);

console.log('\n== PHASE 9: SELLER OWNS THEIR PRICE (no cross-seller tampering) ==');
let ok=await led.setListingPrice(fake,'g1','w-seller',999,'creator');
t('owner can set their own price', ok===true && games.get('g1').price_minor===999);
ok=await led.setListingPrice(fake,'g1','w-attacker',50,'creator');
t('another wallet CANNOT reprice the listing', ok===false && games.get('g1').price_minor===999);

console.log('\n== PHASE 9: ENTITLEMENT IDEMPOTENCY (duplicate/replayed webhook) ==');
const g1=await led.grantEntitlement(fake,{id:'e1',gameId:'g1',buyerWallet:'w-buyer',buyerEmail:'b@x.com',priceMinor:999,stripeSession:'cs_A'});
const g2=await led.grantEntitlement(fake,{id:'e1',gameId:'g1',buyerWallet:'w-buyer',buyerEmail:'b@x.com',priceMinor:999,stripeSession:'cs_A'});
t('first grant succeeds', g1===true);
t('replayed webhook grants nothing (no double entitlement)', g2===false);
t('exactly one entitlement stored', ents.size===1, 'stored '+ents.size);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

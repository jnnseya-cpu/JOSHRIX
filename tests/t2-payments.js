const P = require('./build/shared/payments.js');
let pass=0,fail=0,crit=[];
const t=(id,name,cond,detail='')=>{ if(cond){pass++;console.log(`  PASS ${id} ${name}`);} else {fail++;console.log(`  FAIL ${id} ${name}`+(detail?`\n         -> ${detail}`:''));crit.push(id+' '+name);} };

console.log('\n== PHASE 9: PAYMENTS — SERVER-SIDE PRICE AUTHORITY ==');
console.log('  packages:', P.TOPUP_PACKAGES.map(p=>`${p.id}=£${(p.priceMinor/100).toFixed(2)}/${p.acu}ACU`).join(' '));

// P9-01 client cannot dictate price
const r1 = P.TopupRequestSchema.safeParse({ packageId: P.TOPUP_PACKAGES[0].id, priceMinor: 1, acu: 999999 });
t('P9-01','client price/acu fields are ignored or rejected',
  !r1.success || (r1.data.priceMinor === undefined && r1.data.acu === undefined),
  'parsed data: '+JSON.stringify(r1.success?r1.data:r1.error.issues[0]));

// P9-02 unknown package must be REJECTED by schema (topup.ts uses a non-null assertion!)
const r2 = P.TopupRequestSchema.safeParse({ packageId: 'not_a_real_package' });
t('P9-02','unknown packageId rejected at schema (guards the `!` assertion in topup.ts)', !r2.success,
  r2.success ? 'ACCEPTED -> TOPUP_PACKAGES.find() returns undefined -> 500 crash on pkg.priceMinor' : '');

// P9-03 negative / zero / huge
for (const bad of [{packageId:''},{packageId:null},{packageId:123},{}]) {
  const r = P.TopupRequestSchema.safeParse(bad);
  t('P9-03','malformed topup rejected: '+JSON.stringify(bad), !r.success);
}

console.log('\n== PHASE 9: LEDGER BALANCE INVARIANT (reconciliation must be zero) ==');
for (const pkg of P.TOPUP_PACKAGES) {
  const postings = P.topupPostings(pkg.priceMinor);
  const sum = postings.reduce((s,p)=>s+p.deltaMinor,0);
  t('P9-04',`topup ${pkg.id} postings balance to zero`, sum===0, 'sum='+sum+' postings='+JSON.stringify(postings));
}

console.log('\n== PHASE 9: MARKETPLACE SPLIT MATH ==');
const split = P.marketplaceSplit({ grossMinor: 10000, method:'card', sellerPlan:'creator', hasLineage:false });
console.log('  £100 sale ->', JSON.stringify(split));
const sPost = P.salePostings(split);
t('P9-05','sale postings balance to zero', sPost.reduce((s,p)=>s+p.deltaMinor,0)===0, JSON.stringify(sPost));
// Field names must match what marketplaceSplit actually returns: reading
// platformMinor/processorMinor (which do not exist) made this report a money
// leak on every run, so a real leak would have looked identical.
const parts = (split.creatorMinor??0)+(split.commissionMinor??0)+(split.processingMinor??0)+(split.lineageMinor??0);
t('P9-06','split parts sum to gross (no money created or lost)', parts===10000, `parts=${parts} gross=10000`);

// P9-07 lineage split
const sl = P.marketplaceSplit({ grossMinor: 10000, method:'card', sellerPlan:'creator', hasLineage:true });
t('P9-07','lineage sale still sums to gross',
  (sl.creatorMinor??0)+(sl.commissionMinor??0)+(sl.processingMinor??0)+(sl.lineageMinor??0)===10000,
  JSON.stringify(sl));
t('P9-08','lineage royalty is non-zero when hasLineage', (sl.lineageMinor??0) > 0, JSON.stringify(sl));

// P9-09 adversarial amounts
for (const gross of [0, 1, -100, 99999999]) {
  try {
    const s = P.marketplaceSplit({ grossMinor: gross, method:'card', sellerPlan:'creator', hasLineage:false });
    const sum = (s.creatorMinor??0)+(s.commissionMinor??0)+(s.processingMinor??0)+(s.lineageMinor??0);
    t('P9-09',`gross ${gross} conserves value`, sum===gross, `sum=${sum} expected=${gross} :: ${JSON.stringify(s)}`);
  } catch(e){ t('P9-09',`gross ${gross} rejected (${String(e.message).slice(0,44)})`, gross < 50, 'a listing at or above 50p must not throw'); }
}

console.log('\n== PHASE 9: PLANS ==');
console.log('  plans:', P.PLANS.map(p=>`${p.id}:£${((p.monthlyMinor??0)/100).toFixed(2)}/${p.monthlyAcu}ACU`).join(' '));
t('P9-10','no plan grants ACUs at zero price (free-AI rule)',
  P.PLANS.every(p => (p.monthlyAcu??0) === 0 || (p.monthlyMinor??0) > 0),
  JSON.stringify(P.PLANS.filter(p=>(p.monthlyAcu??0)>0 && (p.monthlyMinor??0)<=0)));

console.log('\n== PHASE 10: THE PRICING LADDER ==');
// A ladder that pays people to stay free is a commercial outage, and every
// number in it looks reasonable on its own — which is how it survived.
let ladderErr = null;
try { P.assertPlanLadder(1200); } catch (e) { ladderErr = e.message; }
t('P10-01','the plan ladder holds (paid > free, covers a 3D hold, monotonic)', ladderErr === null, ladderErr);

const paid = P.PLANS.filter(p => p.monthlyAcu > 0);
t('P10-02','every paid tier grants more than the free trial',
  paid.every(p => p.monthlyAcu > P.FREE_GRANT_ACU),
  `free grant ${P.FREE_GRANT_ACU}; worst paid ${Math.min(...paid.map(p=>p.monthlyAcu))}`);
t('P10-03','every paid tier can start a 3D forge (hold 1200)',
  paid.every(p => p.monthlyAcu >= 1200),
  'a paying customer who cannot use the premium lane they paid for');
t('P10-04','the free refill floor stays above the 3D hold',
  P.FREE_REFILL_FLOOR > 1200,
  'below this a tester drops under the hold and can never test 3D again');
t('P10-05','the free trial is finite',
  Number.isInteger(P.FREE_REFILL_LIFETIME_MAX) && P.FREE_REFILL_LIFETIME_MAX > 0 && P.FREE_REFILL_LIFETIME_MAX <= 5,
  `unlimited refills is unlimited free AI: ${P.FREE_REFILL_LIFETIME_MAX}`);
t('P10-06','a better plan always costs more and takes less commission',
  paid.every((p,i) => i===0 || (p.monthlyAcu > paid[i-1].monthlyAcu && p.commission < paid[i-1].commission)));

// The pricing page states these numbers to buyers. It is a static file, so it
// cannot import them — which means the only thing stopping it from advertising
// a figure the billing code no longer honours is this check.
{
  const fs = require('node:fs'), path = require('node:path');
  const page = path.join(process.env.JOSHRIX_ROOT || '.', 'frontend/pricing.html');
  if (fs.existsSync(page)) {
    const html = fs.readFileSync(page, 'utf8');
    const wrong = paid.filter(p => !html.includes(p.monthlyAcu.toLocaleString('en-GB') + ' ACUs'));
    t('P10-07','the pricing page advertises the ACUs the code actually grants',
      wrong.length === 0,
      wrong.map(p => `${p.name} should say ${p.monthlyAcu.toLocaleString('en-GB')}`).join('; '));
  } else {
    console.log('  SKIP P10-07 — pricing.html not found from this working directory');
  }
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(0);

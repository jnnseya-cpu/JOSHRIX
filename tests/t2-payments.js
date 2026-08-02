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
const parts = (split.creatorMinor??0)+(split.platformMinor??0)+(split.processorMinor??0)+(split.lineageMinor??0);
t('P9-06','split parts sum to gross (no money created or lost)', parts===10000, `parts=${parts} gross=10000`);

// P9-07 lineage split
const sl = P.marketplaceSplit({ grossMinor: 10000, method:'card', sellerPlan:'creator', hasLineage:true });
t('P9-07','lineage sale still sums to gross',
  (sl.creatorMinor??0)+(sl.platformMinor??0)+(sl.processorMinor??0)+(sl.lineageMinor??0)===10000,
  JSON.stringify(sl));
t('P9-08','lineage royalty is non-zero when hasLineage', (sl.lineageMinor??0) > 0, JSON.stringify(sl));

// P9-09 adversarial amounts
for (const gross of [0, 1, -100, 99999999]) {
  try {
    const s = P.marketplaceSplit({ grossMinor: gross, method:'card', sellerPlan:'creator', hasLineage:false });
    const sum = (s.creatorMinor??0)+(s.platformMinor??0)+(s.processorMinor??0)+(s.lineageMinor??0);
    t('P9-09',`gross ${gross} conserves value`, sum===gross, `sum=${sum} expected=${gross} :: ${JSON.stringify(s)}`);
  } catch(e){ t('P9-09',`gross ${gross} handled (threw: ${String(e.message).slice(0,60)})`, gross < 0, 'threw on a value that should be handled'); }
}

console.log('\n== PHASE 9: PLANS ==');
console.log('  plans:', P.PLANS.map(p=>`${p.id}:£${((p.priceMinor??0)/100).toFixed(2)}/${p.monthlyAcu}ACU`).join(' '));
t('P9-10','no plan grants ACUs at zero price (free-AI rule)',
  P.PLANS.every(p => (p.monthlyAcu??0) === 0 || (p.priceMinor??0) > 0),
  JSON.stringify(P.PLANS.filter(p=>(p.monthlyAcu??0)>0 && (p.priceMinor??0)<=0)));
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(0);

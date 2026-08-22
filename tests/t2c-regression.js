const P = require('./build/shared/payments.js');
let pass=0,fail=0;
const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};
console.log('\n== REGRESSION: negative creator payout (defect P9-09) ==');
for (const g of [1, 10, 25, 26, 49]) {
  const r = P.CheckoutRequestSchema.safeParse({listingId:'L',priceMinor:g,method:'card',sellerPlan:'creator'});
  t(`schema rejects ${g}p listing`, !r.success);
}
for (const g of [50, 99, 100, 500, 10000]) {
  const r = P.CheckoutRequestSchema.safeParse({listingId:'L',priceMinor:g,method:'card',sellerPlan:'creator'});
  t(`schema accepts ${g}p listing`, r.success);
}
console.log('\n  split() refuses sub-floor even when validation is bypassed:');
for (const g of [0, 1, 25, 49, -100]) {
  let threw=false; try { P.marketplaceSplit({grossMinor:g,method:'card',sellerPlan:'creator'}); } catch(e){ threw=true; }
  t(`split() throws on ${g}p`, threw);
}
console.log('\n  creator payout is positive at every accepted price, on every rail:');
let worst=null;
for (const method of ['card','bitripay','mobile_money']) {
  for (let g=50; g<=2000; g+=1) {
    const s = P.marketplaceSplit({grossMinor:g,method,sellerPlan:'creator',hasLineage:true});
    if (s.creatorMinor < 0 && (!worst || s.creatorMinor < worst.creatorMinor)) worst={method,g,...s};
    const sum = s.commissionMinor+s.processingMinor+s.lineageMinor+s.creatorMinor;
    if (sum !== g) { fail++; console.log(`  FAIL value not conserved at ${method} ${g}p`); break; }
  }
}
t('no negative payout at any accepted price/rail/lineage combination', worst===null, worst?JSON.stringify(worst):'');
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

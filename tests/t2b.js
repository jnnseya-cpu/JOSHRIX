const P = require('./build/shared/payments.js');
console.log('== CORRECTED: value conservation (commission+processing+lineage+creator == gross) ==');
for (const g of [10000, 500, 100, 50, 25, 10, 1, 0, -100]) {
  try {
    const s = P.marketplaceSplit({ grossMinor: g, method:'card', sellerPlan:'creator', hasLineage:false });
    const sum = s.commissionMinor + s.processingMinor + (s.lineageMinor||0) + s.creatorMinor;
    const flag = s.creatorMinor < 0 ? '  <-- CREATOR PAYOUT NEGATIVE' : '';
    console.log(`  gross ${String(g).padStart(9)}  creator ${String(s.creatorMinor).padStart(9)}  conserves=${sum===g}${flag}`);
  } catch(e) { console.log(`  gross ${String(g).padStart(9)}  THREW: ${e.message.slice(0,70)}`); }
}
console.log('\n== What price floor does the checkout schema enforce? ==');
for (const price of [-100, 0, 1, 25, 50, 99, 100, 500]) {
  const r = P.CheckoutRequestSchema.safeParse({ listingId:'L1', priceMinor: price, method:'card', sellerPlan:'creator', hasLineage:false });
  console.log(`  priceMinor ${String(price).padStart(6)} -> ${r.success ? 'ACCEPTED' : 'rejected ('+r.error.issues[0].message+')'}`);
}
console.log('\n== Break-even: lowest price where the creator is not paid a negative amount ==');
let be=null;
for (let p=1;p<=1000;p++){ const s=P.marketplaceSplit({grossMinor:p,method:'card',sellerPlan:'creator',hasLineage:false}); if(s.creatorMinor>=0){be=p;break;} }
console.log(`  creator payout turns non-negative at £${(be/100).toFixed(2)} (${be}p)`);
console.log('\n== PLANS (corrected field name monthlyMinor) ==');
P.PLANS.forEach(p=>console.log(`  ${p.id.padEnd(12)} £${((p.monthlyMinor||0)/100).toFixed(2)}/mo  ${p.monthlyAcu} ACU  commission ${(p.commission*100).toFixed(1)}%`));
const freeAcu = P.PLANS.filter(p=>p.monthlyAcu>0 && (p.monthlyMinor||0)<=0);
console.log(`  NO-FREE-AI rule: ${freeAcu.length===0 ? 'PASS — every ACU-granting plan is paid' : 'FAIL — '+JSON.stringify(freeAcu)}`);

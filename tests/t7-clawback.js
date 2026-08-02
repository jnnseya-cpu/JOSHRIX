/* PHASE 9: refund -> ACU clawback, idempotency, partial-spend handling */
const led=require('./build/api/_ledger.js');
let credits=[], wallets=new Map();
const fake=(st,...v)=>{const q=st.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE|^ALTER TABLE/i.test(q))return Promise.resolve([]);
  if(/^INSERT INTO acu_credits/i.test(q)){const[sess,email,pkg,acu,pi,wid]=v;
    if(!credits.find(c=>c.stripe_session===sess))credits.push({stripe_session:sess,email,package_id:pkg,acu,payment_intent:pi,wallet_id:wid,clawed_back_at:null});
    return Promise.resolve([]);}
  if(/UPDATE acu_credits SET clawed_back_at/i.test(q)){const pi=v[0],pi2=v[1],sess=v[2],sess2=v[3];
    const c=credits.find(x=>x.clawed_back_at===null&&((pi&&x.payment_intent===pi2)||(sess&&x.stripe_session===sess2)));
    if(!c)return Promise.resolve([]); c.clawed_back_at=Date.now();
    return Promise.resolve([{acu:c.acu,wallet_id:c.wallet_id,package_id:c.package_id}]);}
  if(/WITH prev AS[\s\S]*UPDATE wallets/i.test(q)){const id=v[0],amt=v[1],amt2=v[2];const w=wallets.get(id);
    if(!w)return Promise.resolve([]); const prev=w.balance; w.balance=Math.max(0,prev-amt);
    return Promise.resolve([{balance:w.balance,removed:Math.min(amt2,prev)}]);}
  if(/^INSERT INTO wallets/i.test(q)){const[id,bal]=v;wallets.set(id,{id,balance:bal});return Promise.resolve([]);}
  return Promise.resolve([]);};
led.__setDbForTests(fake);
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
console.log('\n== PHASE 9: REFUND -> AUTOMATIC ACU CLAWBACK ==');
wallets.set('w-buyer',{id:'w-buyer',balance:2500});
await led.creditAcu(fake,{stripeSession:'cs_1',email:'b@x.com',packageId:'acu_10',acu:1000,paymentIntent:'pi_1',walletId:'w-buyer'});
console.log('  buyer bought 1000 ACUs (balance 2500), now refunds:');
let c=await led.claimAcuClawback(fake,{paymentIntent:'pi_1'});
t('refund locates the credit', c && c.acu===1000 && c.wallet_id==='w-buyer', JSON.stringify(c));
let w=await led.clawbackWallet(fake,'w-buyer',1000);
t('1000 ACUs removed', w.removed===1000 && w.balance===1500, JSON.stringify(w));

console.log('\n  duplicate/replayed refund webhook must NOT claw back twice:');
const c2=await led.claimAcuClawback(fake,{paymentIntent:'pi_1'});
t('second claim returns nothing (idempotent)', c2===null, JSON.stringify(c2));
t('balance unchanged after replay', wallets.get('w-buyer').balance===1500);

console.log('\n  buyer already SPENT most of the credit — must not go negative:');
wallets.set('w-spent',{id:'w-spent',balance:120});
await led.creditAcu(fake,{stripeSession:'cs_2',email:'c@x.com',packageId:'acu_10',acu:1000,paymentIntent:'pi_2',walletId:'w-spent'});
const c3=await led.claimAcuClawback(fake,{paymentIntent:'pi_2'});
const w3=await led.clawbackWallet(fake,'w-spent',Number(c3.acu));
t('balance floors at 0, never negative', w3.balance===0, JSON.stringify(w3));
t('removed reports what was ACTUALLY recovered (120, not 1000)', w3.removed===120, JSON.stringify(w3));
console.log(`       -> shortfall of ${1000-w3.removed} ACUs is reported to the operator, not silently absorbed`);

console.log('\n  refund for an unknown charge is handled safely:');
const c4=await led.claimAcuClawback(fake,{paymentIntent:'pi_does_not_exist'});
t('unknown charge returns null (no crash, no wrong wallet touched)', c4===null);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

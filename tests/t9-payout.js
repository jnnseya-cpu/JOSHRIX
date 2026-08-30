/* PHASE 9/20: payout authority, double-spend, concurrency
 *
 * Withdrawing now requires a verified caller who owns the wallet. This endpoint
 * takes the account to debit AND the destination to pay from the same body, so
 * before identity was verified anyone holding a walletId could send a creator's
 * earnings to themselves. Every request below therefore carries a token, and
 * the wallets are bound to that caller's uid. */
const led=require('./build/api/_ledger.js');
const stub=require('./_authstub.js');
const fb=require('./build/shared/firebase.js');
const OWNER_UID='uid-earner';
const AUTH=()=>stub.authHeader(fb.FIREBASE_PROJECT_ID,{sub:OWNER_UID,email:'earner@example.com'});
/* Which wallets this caller owns. The handler reads firebase_uid to decide. */
const owned=new Set(['w-poor','w-rich','w-race']);
/* A withdrawal now names one of the creator's OWN saved destinations. It used
   to take a raw destinationRef from the body, and the wallet page sent the
   hard-coded literal 'tok_demo_dest_2941' on every request — so no payout in
   the system could ever have reached anybody. */
const dests=new Map([
  ['pd_ok',   {id:'pd_ok',   wallet_id:'w-rich', rail:'bank_transfer', label:'Barclays', enc:'x', last4:'4321'}],
  ['pd_poor', {id:'pd_poor', wallet_id:'w-poor', rail:'bank_transfer', label:'Poor',     enc:'x', last4:'0000'}],
  ['pd_race', {id:'pd_race', wallet_id:'w-race', rail:'bank_transfer', label:'Race',     enc:'x', last4:'9999'}],
  ['pd_mm',   {id:'pd_mm',   wallet_id:'w-rich', rail:'mobile_money',  label:'M-Pesa',   enc:'x', last4:'7777'}],
  ['pd_them', {id:'pd_them', wallet_id:'w-somebodyelse', rail:'bank_transfer', label:'Theirs', enc:'x', last4:'1111'}],
  ['pd_target',  {id:'pd_target',  wallet_id:'w-target',  rail:'bank_transfer', label:'Target',  enc:'x', last4:'2222'}],
  ['pd_unbound', {id:'pd_unbound', wallet_id:'w-unbound', rail:'bank_transfer', label:'Unbound', enc:'x', last4:'3333'}],
]);
const destFor=w=>({'w-poor':'pd_poor','w-rich':'pd_ok','w-race':'pd_race','w-target':'pd_target','w-unbound':'pd_unbound'}[w]||'pd_ok');
const earn=new Map(), reqs=new Map();
const fake=(st,...v)=>{const q=st.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE/i.test(q))return Promise.resolve([]);
  if(/^INSERT INTO creator_earnings/i.test(q)){const[w,a]=v;const e=earn.get(w)||{wallet_id:w,available_minor:0,reserved_minor:0,paid_minor:0};e.available_minor+=a;earn.set(w,e);return Promise.resolve([]);}
  if(/SELECT wallet_id, available_minor/i.test(q)){const e=earn.get(v[0]);return Promise.resolve(e?[e]:[]);}
  if(/UPDATE creator_earnings SET available_minor = available_minor - /i.test(q)){const[amt,amt2,w,amt3]=v;const e=earn.get(w);
    if(e&&e.available_minor>=amt3){e.available_minor-=amt;e.reserved_minor+=amt2;return Promise.resolve([{wallet_id:w}]);}return Promise.resolve([]);}
  if(/UPDATE creator_earnings SET available_minor = available_minor \+/i.test(q)){const[amt,amt2,w]=v;const e=earn.get(w);if(e){e.available_minor+=amt;e.reserved_minor=Math.max(0,e.reserved_minor-amt2);}return Promise.resolve([]);}
  if(/SELECT firebase_uid FROM wallets/i.test(q)){return Promise.resolve(owned.has(v[0])?[{firebase_uid:OWNER_UID}]:[]);}
  // saved payout destinations — scoped to the wallet, which is the guard
  if(/SELECT id, rail, label, enc, last4 FROM payout_destinations/i.test(q)){
    const d=dests.get(v[0]); return Promise.resolve(d&&d.wallet_id===v[1]?[d]:[]);}
  if(/^INSERT INTO payout_requests/i.test(q)){const[id,w,amt]=v;reqs.set(id,{id,wallet_id:w,amount_minor:amt,status:'requested'});return Promise.resolve([]);}
  // the transition is `status = ANY(${from})`, so the fake must honour `from` —
  // hardcoding 'requested' here would hide the very bug this now covers
  if(/UPDATE payout_requests SET status/i.test(q)){const[st,by,note,id,from]=v;const r=reqs.get(id);
    if(r&&(from||['requested']).indexOf(r.status)!==-1){r.status=st;return Promise.resolve([{id:r.id,wallet_id:r.wallet_id,amount_minor:r.amount_minor,status:st}]);}return Promise.resolve([]);}
  return Promise.resolve([]);};
led.__setDbForTests(fake);
const handler=require('./build/api/payout.js').default;
const mkRes=()=>{const r={code:null,body:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};
const post=async(b,headers)=>{const res=mkRes();await handler({method:'POST',headers:headers||AUTH(),body:b,query:{}},res);return res;};
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
console.log('\n== PHASE 9: PAYOUT — cannot withdraw what you have not earned ==');
earn.set('w-poor',{wallet_id:'w-poor',available_minor:0,reserved_minor:0,paid_minor:0});
let r=await post({walletId:'w-poor',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_poor'});
t('zero-earnings withdrawal refused', r.code===402, `code ${r.code} ${JSON.stringify(r.body).slice(0,80)}`);

await led.creditEarnings(fake,'w-rich',10000);
r=await post({walletId:'w-rich',amountMinor:20000,rail:'bank_transfer',destinationId:'pd_ok'});
t('over-withdrawal refused', r.code===402, `code ${r.code}`);
r=await post({walletId:'w-rich',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_ok'});
t('valid withdrawal queued (202, not a false success)', r.code===202 && r.body.queued===true, `code ${r.code}`);
t('response does NOT claim money was sent', /queued|reserved|operator/i.test(r.body.note||''), r.body.note);
t('full destination is never echoed back', !String(JSON.stringify(r.body)).includes('tok_abc123'), JSON.stringify(r.body).slice(0,120));

console.log('\n== PHASE 20: DOUBLE-SPEND — same earnings withdrawn twice ==');
console.log(`  after £50 reserved from £100: available=${earn.get('w-rich').available_minor}, reserved=${earn.get('w-rich').reserved_minor}`);
r=await post({walletId:'w-rich',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_ok'});
t('second £50 withdrawal succeeds (balance covers it)', r.code===202);
r=await post({walletId:'w-rich',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_ok'});
t('THIRD £50 withdrawal refused — earnings exhausted', r.code===402, `code ${r.code}`);
t('available floored at 0, never negative', earn.get('w-rich').available_minor===0, JSON.stringify(earn.get('w-rich')));
t('reserved matches what was taken', earn.get('w-rich').reserved_minor===10000, JSON.stringify(earn.get('w-rich')));

console.log('\n== PHASE 6: CONCURRENCY — 8 simultaneous withdrawals of the same money ==');
await led.creditEarnings(fake,'w-race',10000);
const results=await Promise.all(Array.from({length:8},(_,i)=>post({walletId:'w-race',amountMinor:10000,rail:'bank_transfer',destinationId:'pd_race'})));
const okCount=results.filter(x=>x.code===202).length;
t('exactly ONE of 8 concurrent full withdrawals succeeds', okCount===1, `${okCount} succeeded`);
t('no negative balance after the race', earn.get('w-race').available_minor>=0, JSON.stringify(earn.get('w-race')));

console.log('\n== PHASE 21: OPERATOR DECISION IS SINGLE-USE ==');
const anyId=[...reqs.keys()][0];
const d1=await led.decidePayoutRequest(fake,anyId,'approved','admin@joshrix','ok');
const d2=await led.decidePayoutRequest(fake,anyId,'approved','admin@joshrix','ok again');
t('first approval succeeds', !!d1);
t('re-approving the same request does nothing', d2===null);

console.log('\n== PHASE 21b: APPROVING IS NOT PAYING ==');
// The desk tells the operator "approved — mark paid once the rail has executed",
// but the predicate was `status = 'requested'` alone, so that second step could
// never succeed and an approved withdrawal was stuck forever.
const d3=await led.decidePayoutRequest(fake,anyId,'paid','admin@joshrix',null);
t('an APPROVED withdrawal can then be marked paid', !!d3,
  'without this the only way to record that money left was to edit the database by hand');
t('the row really moved to paid', reqs.get(anyId).status==='paid');
const d4=await led.decidePayoutRequest(fake,anyId,'paid','admin@joshrix',null);
t('but marking paid twice does nothing', d4===null, 'a repeated click must not double-record a payment');

const rejId='pr-reject-test';
reqs.set(rejId,{id:rejId,wallet_id:'w-x',amount_minor:5000,status:'requested'});
await led.decidePayoutRequest(fake,rejId,'rejected','admin@joshrix',null);
t('a REJECTED withdrawal can never be paid',
  (await led.decidePayoutRequest(fake,rejId,'paid','admin@joshrix',null))===null,
  'the reservation was already returned to the creator — paying it too pays twice');
t('nor re-rejected (which would release the reservation again)',
  (await led.decidePayoutRequest(fake,rejId,'rejected','admin@joshrix',null))===null);
console.log('\n== IDENTITY: money out is the one place with no grace period ==');
/* Before identity was verified, this endpoint took the wallet to debit and the
   destination to pay from the same unauthenticated body — and /api/wallet-init
   would hand a walletId to anyone who knew the owner's email address. */
earn.set('w-target',{wallet_id:'w-target',available_minor:50000,reserved_minor:0,paid_minor:0});
owned.add('w-target');
let a=await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_target'},{});
t('a withdrawal with NO token is refused', a.code===401, `code ${a.code}`);
t('and says why', a.body&&a.body.code==='auth_required');
t('nothing was reserved', earn.get('w-target').reserved_minor===0);

a=await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_target'},
  stub.authHeader(fb.FIREBASE_PROJECT_ID,{sub:'uid-someone-else',email:'thief@example.com'}));
t('a signed-in stranger cannot withdraw from a wallet they do not own', a.code===403, `code ${a.code}`);
t('the refusal names the reason', a.body&&a.body.code==='not_your_wallet');
t('and still nothing was reserved', earn.get('w-target').reserved_minor===0);

/* A wallet nobody has ever signed into cannot prove ownership. Refusing is the
   right failure: paying the wrong person is not recoverable. */
earn.set('w-unbound',{wallet_id:'w-unbound',available_minor:50000,reserved_minor:0,paid_minor:0});
a=await post({walletId:'w-unbound',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_unbound'});
t('an unlinked wallet cannot withdraw until its owner signs in', a.code===401, `code ${a.code}`);
t('and is told how to fix it', a.body&&a.body.code==='wallet_unlinked');

t('the legitimate owner still gets through',
  (await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_target'})).code===202);

console.log('\n== DESTINATION: a withdrawal must name where the money goes ==');
owned.add('w-target');
/* The whole reason this exists: destinationRef used to be a free string from
   the request body, and every request carried the same hard-coded fake.
   Measured as a DELTA — an earlier block in this file legitimately reserved
   from this same wallet, so an absolute of zero would be asserting the wrong
   thing and would pass or fail on test ordering rather than on behaviour. */
const reservedBefore=earn.get('w-target').reserved_minor;
let d=await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer'});
t('a withdrawal with NO destination is refused', d.code===400, `code ${d.code}`);
d=await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_nonexistent'});
t('an unknown destination is refused', d.code===404, `code ${d.code}`);
d=await post({walletId:'w-target',amountMinor:5000,rail:'bank_transfer',destinationId:'pd_them'});
t('SOMEBODY ELSE\u2019S destination cannot be paid to', d.code===404, `code ${d.code}`);
t('and none of those reserved a penny', earn.get('w-target').reserved_minor===reservedBefore,
  `reserved moved ${reservedBefore} -> ${earn.get('w-target').reserved_minor}`);
d=await post({walletId:'w-rich',amountMinor:1000,rail:'bank_transfer',destinationId:'pd_mm'});
t('a destination set up for another rail is refused', d.code===400 && d.body.code==='rail_mismatch', `code ${d.code}`);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

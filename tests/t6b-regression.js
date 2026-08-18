const led = require('./build/api/_ledger.js');
const wallets=new Map();
const fake=(strings,...v)=>{const q=strings.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE|^ALTER TABLE/i.test(q))return Promise.resolve([]);
  if(/^INSERT INTO wallets/i.test(q)){const[id,bal,cat,email,name]=v;if(!wallets.has(id))wallets.set(id,{id,balance:bal,category:cat,email,name,plan:'explorer',created_at:Date.now()});return Promise.resolve([]);}
  if(/FROM wallets WHERE lower\(email\)/i.test(q)){const e=String(v[0]).toLowerCase();const w=[...wallets.values()].find(x=>(x.email||'').toLowerCase()===e);return Promise.resolve(w?[w]:[]);}
  if(/FROM wallets WHERE id/i.test(q)){const w=wallets.get(v[0]);return Promise.resolve(w?[w]:[]);}
  if(/^UPDATE wallets SET name/i.test(q))return Promise.resolve([]);
  return Promise.resolve([]);};
led.__setDbForTests(fake);
const handler=require('./build/api/wallet-init.js').default;
const mkRes=()=>{const r={code:null,body:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};
const post=async body=>{const res=mkRes();await handler({method:'POST',headers:{},body,query:{}},res);return res.body;};
let pass=0,fail=0; const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
console.log('\n== REGRESSION P20-01: free-ACU farming ==');
wallets.clear();
let total=0, ids=[];
for(let i=0;i<20;i++){const b=await post({}); total+=b.balance; ids.push(b.walletId);}
t('20 anonymous requests grant 0 ACUs', total===0, 'granted '+total);
t('anonymous wallets are still issued (flow unbroken)', new Set(ids).size===20);

wallets.clear();
const first=await post({email:'creator@example.com', name:'Creator'});
t('first signed-in request creates a wallet with NO credit', first.balance===0 && !!first.walletId, JSON.stringify(first));
let ids2=[first.walletId], minted=0;
for(let i=0;i<20;i++){const b=await post({email:'creator@example.com'}); ids2.push(b.walletId); if(b.created) minted++;}
t('20 repeats on the SAME email create no second wallet', new Set(ids2).size===1, 'distinct wallets: '+new Set(ids2).size);
t('no repeat mints a new account', minted===0, 'minted '+minted);

console.log('\n  case/whitespace variants must not bypass the cap:');
for (const v of ['Creator@Example.com','  creator@example.com  ','CREATOR@EXAMPLE.COM']) {
  const b=await post({email:v});
  t(`variant ${JSON.stringify(v)} returns the same wallet`, b.walletId===first.walletId, 'got '+b.walletId);
}
console.log('\n  malformed emails get no grant:');
for (const bad of ['notanemail','a@b','@x.com','x@.com','','   ', 'a@b.c'.repeat(60)]) {
  const b=await post({email:bad});
  t(`${JSON.stringify(String(bad).slice(0,18))} -> 0 ACUs`, b.balance===0, 'granted '+b.balance);
}
console.log('\n  a genuinely different creator still gets their own account:');
const other=await post({email:'second@example.com'});
t('distinct email -> distinct wallet, also unfunded',
  other.balance===0 && !!other.walletId && other.walletId!==first.walletId, JSON.stringify(other));
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

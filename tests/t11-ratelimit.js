/* PHASE 13/20: rate limiting, kill switch, +tag bypass */
const led=require('./build/api/_ledger.js');
const guard=require('./build/api/_guard.js');
const store=new Map(), wallets=new Map();
const now=()=>Date.now();
const fake=(st,...v)=>{const q=st.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE|^ALTER TABLE/i.test(q))return Promise.resolve([]);
  if(/INSERT INTO rate_limits/i.test(q)){const key=v[0],win=v[1];const e=store.get(key);
    if(!e||now()-e.start>win*1000){store.set(key,{start:now(),count:1});return Promise.resolve([{count:1,retry_after:win}]);}
    e.count++;return Promise.resolve([{count:e.count,retry_after:Math.max(1,win-Math.floor((now()-e.start)/1000))}]);}
  if(/^INSERT INTO wallets/i.test(q)){const[id,bal,cat,email]=v;if(!wallets.has(id))wallets.set(id,{id,balance:bal,category:cat,email,plan:'explorer'});return Promise.resolve([]);}
  if(/FROM wallets WHERE lower\(email\)/i.test(q)){const e=String(v[0]).toLowerCase();const w=[...wallets.values()].find(x=>(x.email||'').toLowerCase()===e);return Promise.resolve(w?[w]:[]);}
  if(/FROM wallets WHERE id/i.test(q)){const w=wallets.get(v[0]);return Promise.resolve(w?[w]:[]);}
  return Promise.resolve([]);};
led.__setDbForTests(fake);
const mkRes=()=>{const r={code:null,body:null,headers:{}};r.setHeader=(k,x)=>{r.headers[k]=x;};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
console.log('\n== PHASE 13: RATE LIMITER CORE ==');
store.clear();
let allowed=0,blocked=0;
for(let i=0;i<25;i++){const r=await guard.rateLimit(fake,'k1',20,3600); r.ok?allowed++:blocked++;}
t('20 allowed, 5 blocked at limit 20', allowed===20&&blocked===5, `allowed=${allowed} blocked=${blocked}`);
const r=await guard.rateLimit(fake,'k1',20,3600);
t('blocked response carries a retry-after', r.retryAfter>0, JSON.stringify(r));
t('a different key is unaffected', (await guard.rateLimit(fake,'k2',20,3600)).ok===true);

console.log('\n  limiter FAILS OPEN when the database is down (never locks the platform out):');
const broken=()=>Promise.reject(new Error('db down'));
const fo=await guard.rateLimit(broken,'k3',1,60);
t('db error -> request allowed', fo.ok===true, JSON.stringify(fo));

console.log('\n  client IP extraction:');
t('x-forwarded-for chain -> first hop', guard.clientIp({headers:{'x-forwarded-for':'1.2.3.4, 10.0.0.1'}})==='1.2.3.4');
t('x-real-ip fallback', guard.clientIp({headers:{'x-real-ip':'9.9.9.9'}})==='9.9.9.9');
t('no headers -> "unknown" (still limitable)', guard.clientIp({headers:{}})==='unknown');

console.log('\n== PHASE 20: FORGE DENIAL-OF-WALLET ==');
store.clear(); wallets.set('w1',{id:'w1',balance:999999,category:'tester',email:'a@b.com'});
const forge=require('./build/api/forge-game.js').default;
let ok=0,limited=0;
for(let i=0;i<35;i++){const res=mkRes();
  await forge({method:'POST',headers:{'x-forwarded-for':'5.5.5.5'},body:{prompt:'a game about testing',walletId:'w1'},query:{}},res);
  if(res.code===429)limited++; else ok++;}
t('forge blocks after 30/hour from one IP', limited>=5, `allowed=${ok} limited=${limited}`);
console.log(`       -> caps one attacker at ~30 forges/hour instead of unlimited`);

console.log('\n== KILL SWITCH ==');
process.env.FORGE_DISABLED='1';
let res=mkRes(); await forge({method:'POST',headers:{'x-forwarded-for':'6.6.6.6'},body:{prompt:'a game about testing',walletId:'w1'},query:{}},res);
t('FORGE_DISABLED=1 stops all AI spend instantly', res.code===503, `code ${res.code}`);
t('message reassures the customer about their ACUs', /ACUs are untouched/i.test(res.body?.error||''), res.body?.error);
delete process.env.FORGE_DISABLED;
res=mkRes(); await forge({method:'POST',headers:{'x-forwarded-for':'7.7.7.7'},body:{prompt:'a game about testing',walletId:'w1'},query:{}},res);
t('unsetting it restores service', res.code!==503, `code ${res.code}`);

console.log('\n== PHASE 20: +TAG / GMAIL-DOT IDENTITY BYPASS ==');
store.clear(); wallets.clear();
const wi=require('./build/api/wallet-init.js').default;
const post=async b=>{const r=mkRes();await wi({method:'POST',headers:{'x-forwarded-for':'8.8.8.8'},body:b,query:{}},r);return r.body;};
const first=await post({email:'alice@gmail.com'});
// Signups are unfunded now, so the thing worth farming is WALLETS, not credit:
// duplicates would split one creator's games, balance and receipts in two.
t('a public signup is created unfunded', first.balance===0, JSON.stringify(first));
let minted=0;
for(const v of ['alice+1@gmail.com','alice+spam@gmail.com','a.l.i.c.e@gmail.com','ALICE@GMAIL.COM','alice+9@googlemail.com']){
  const b=await post({email:v});
  if(b.created) minted++;
  t(`${v.padEnd(26)} -> same wallet, no new account`, b.walletId===first.walletId, `got ${b.walletId} bal ${b.balance}`);
}
t('total extra wallets minted via tag variants = 0', minted===0, 'minted '+minted);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

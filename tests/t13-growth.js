/* Growth Engine: billing, honesty guards, tool validation */
const led=require('./build/api/_ledger.js');
const wallets=new Map(), games=[];
const fake=(st,...v)=>{const q=st.join('?').replace(/\s+/g,' ').trim();
  if(/^CREATE TABLE|^ALTER TABLE/i.test(q))return Promise.resolve([]);
  if(/INSERT INTO rate_limits/i.test(q))return Promise.resolve([{count:1,retry_after:3600}]);
  if(/FROM games WHERE creator_wallet/i.test(q)){return Promise.resolve(games.filter(g=>g.creator_wallet===v[0]));}
  if(/FROM games WHERE id/i.test(q)){const g=games.find(x=>x.id===v[0]);return Promise.resolve(g?[g]:[]);}
  if(/UPDATE wallets SET balance = balance - /i.test(q)){const[c,id,c2]=v;const w=wallets.get(id);
    if(w&&w.balance>=c2){w.balance-=c;return Promise.resolve([{balance:w.balance}]);}return Promise.resolve([]);}
  if(/UPDATE wallets SET balance = balance \+/i.test(q)){const[a,id]=v;const w=wallets.get(id);if(w){w.balance+=a;return Promise.resolve([{balance:w.balance}]);}return Promise.resolve([]);}
  return Promise.resolve([]);};
led.__setDbForTests(fake);
const growth=require('./build/api/growth.js').default;
const analytics=require('./build/api/growth-analytics.js').default;
const mkRes=()=>{const r={code:null,body:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};
const post=async b=>{const r=mkRes();await growth({method:'POST',headers:{'x-forwarded-for':'1.1.1.1'},body:b,query:{}},r);return r;};
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

(async()=>{
console.log('\n== TOOL VALIDATION ==');
let r=await post({tool:'not_a_tool',walletId:'w1'});
t('unknown tool rejected', r.code===400, `code ${r.code}`);
r=await post({tool:'social_posts'});
t('no wallet -> 402 (never free)', r.code===402, `code ${r.code}`);
for (const bad of [null,'',[],{},123]) { r=await post({tool:bad,walletId:'w1'}); t('malformed tool '+JSON.stringify(bad)+' rejected', r.code===400); }

console.log('\n== HONESTY GUARD: advisors refuse to invent data ==');
wallets.set('w1',{id:'w1',balance:5000});
games.length=0;
for (const tool of ['performance','audience','posting_time']) {
  r=await post({tool,walletId:'w1'});
  t(`${tool}: no games -> insufficientData, not a fabricated report`, r.body?.insufficientData===true, JSON.stringify(r.body).slice(0,90));
  t(`${tool}: charged 0 when nothing to analyse`, r.body?.charged===0);
}
const before=wallets.get('w1').balance;
t('no ACUs taken for a refused advisor call', before===5000, 'balance '+before);

console.log('\n  with a published game but almost no plays:');
games.push({id:'g1',title:'Crystal Quest',status:'approved',plays:5,created_at:new Date().toISOString(),creator_wallet:'w1'});
r=await post({tool:'posting_time',walletId:'w1'});
t('posting_time refuses below 30 plays', r.body?.insufficientData===true, JSON.stringify(r.body).slice(0,100));
t('still charged 0', r.body?.charged===0);
t('explains WHY rather than guessing', /too few|noise|30/.test(JSON.stringify(r.body)), JSON.stringify(r.body).slice(0,120));

console.log('\n== BILLING: kill switch and AI-failure refund ==');
process.env.FORGE_DISABLED='1';
r=await post({tool:'social_posts',walletId:'w1'});
t('kill switch stops growth spend too', r.code===503);
delete process.env.FORGE_DISABLED;
delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
const bal0=wallets.get('w1').balance;
r=await post({tool:'social_posts',walletId:'w1'});
t('all providers down -> 502, not a fake result', r.code===502, `code ${r.code}`);
t('hold refunded IN FULL on AI failure', wallets.get('w1').balance===bal0, `before ${bal0} after ${wallets.get('w1').balance}`);
t('error tells the creator they were refunded', /refunded/i.test(r.body?.error||''), r.body?.error);

console.log('\n== ANALYTICS: real numbers only ==');
const ar=mkRes(); await analytics({method:'GET',headers:{},query:{w:'w1'}},ar);
t('returns real counts', ar.body?.summary?.published===1 && ar.body?.summary?.totalPlays===5, JSON.stringify(ar.body?.summary));
t('lists what is NOT measured', Array.isArray(ar.body?.notMeasured) && ar.body.notMeasured.length>=3);
// the honesty disclaimer legitimately contains the word 'estimated'; check the
// DATA fields only, which are the ones that could carry a fabricated number
const dataOnly = JSON.stringify({ summary: ar.body?.summary, games: ar.body?.games, topPerformer: ar.body?.topPerformer });
t('no invented metrics in the data fields', !/estimat|benchmark|industry|typical|projected|forecast/i.test(dataOnly), dataOnly.slice(0,110));
t('every summary value is a real number', Object.values(ar.body?.summary||{}).every(v=>typeof v==='number'), JSON.stringify(ar.body?.summary));
const ar2=mkRes(); await analytics({method:'GET',headers:{},query:{}},ar2);
t('analytics without a wallet refused', ar2.code===400);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();

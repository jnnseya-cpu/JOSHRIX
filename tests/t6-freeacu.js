/* PHASE 20: FRAUD & ABUSE — can an anonymous caller farm free AI credit? */
const led = require('./build/api/_ledger.js');
const wallets = new Map();
// minimal fake Neon tagged-template client
const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g,' ').trim();
  if (/^CREATE TABLE|^ALTER TABLE/i.test(q)) return Promise.resolve([]);
  if (/^INSERT INTO wallets/i.test(q)) { const [id,bal,cat,email,name]=vals; if(!wallets.has(id)) wallets.set(id,{id,balance:bal,category:cat,email,name}); return Promise.resolve([]); }
  if (/^SELECT id, balance, category, email, name, plan FROM wallets WHERE id/i.test(q)) { const w=wallets.get(vals[0]); return Promise.resolve(w?[w]:[]); }
  // The email lookup is the ENTIRE free-credit dedupe. Without it modelled here
  // this test reports "NO DEDUPE" forever, including after the fix landed — a
  // security check that always cries wolf is one people learn to ignore.
  if (/FROM wallets\s+WHERE lower\(email\)/i.test(q)) {
    const want = String(vals[0] ?? '').toLowerCase();
    const hit = [...wallets.values()].find(w => String(w.email ?? '').toLowerCase() === want);
    return Promise.resolve(hit ? [hit] : []);
  }
  if (/^UPDATE wallets SET balance = balance -/i.test(q)) { const [cost,id,cost2]=vals; const w=wallets.get(id); if(w&&w.balance>=cost){w.balance-=cost;return Promise.resolve([{balance:w.balance}]);} return Promise.resolve([]); }
  return Promise.resolve([]);
};
led.__setDbForTests(fake);
const handler = require('./build/api/wallet-init.js').default;
const mkRes=()=>{const r={code:null,body:null};r.setHeader=()=>{};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;return r;};

(async()=>{
  console.log('\n== ATTACK: loop POST /api/wallet-init with an EMPTY body ==');
  let granted=0, ids=[];
  for (let i=0;i<10;i++){
    const res=mkRes();
    await handler({method:'POST',headers:{},body:{},query:{}},res);
    if (res.body?.walletId && res.body?.balance>0){ granted+=res.body.balance; ids.push(res.body.walletId); }
  }
  console.log(`  10 anonymous requests -> ${ids.length} distinct funded wallets, ${granted} free ACUs`);
  console.log(`  distinct ids: ${new Set(ids).size}`);
  const forgesPerWallet = Math.floor(2000/32);            // ~32 ACU per metered forge
  const usdPerForge = 0.10;
  console.log(`\n  IMPACT: each free wallet funds ~${forgesPerWallet} forges of real AI spend`);
  console.log(`          10 wallets  = ~${10*forgesPerWallet} forges = ~$${(10*forgesPerWallet*usdPerForge).toFixed(2)} of provider cost`);
  console.log(`          1,000 wallets (a trivial script) = ~$${(1000*forgesPerWallet*usdPerForge).toFixed(0)} of provider cost`);
  console.log(`\n  VERDICT: ${ids.length>1 ? 'EXPLOITABLE — unauthenticated, unlimited, no rate limit' : 'not exploitable'}`);

  console.log('\n== Same attack with an email attached (is there dedupe?) ==');
  wallets.clear(); const ids2=[];
  for (let i=0;i<5;i++){ const res=mkRes(); await handler({method:'POST',headers:{},body:{email:'same@attacker.test'},query:{}},res); if(res.body?.walletId) ids2.push(res.body.walletId); }
  console.log(`  5 requests, same email -> ${new Set(ids2).size} distinct funded wallets`);
  const deduped = new Set(ids2).size <= 1;
  console.log(`  VERDICT: ${deduped ? 'deduped — one address, one funded wallet' : 'NO DEDUPE — one email can farm unlimited wallets'}`);
  if (!deduped) { console.log('\n  FAIL: the free-credit dedupe is not holding.'); process.exit(1); }
  process.exit(0);
})();

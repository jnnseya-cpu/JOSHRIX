/* PHASE 5/6/11 — adversarial API testing with mocked req/res, no network needed. */
const path=require('path');
const mkRes=()=>{const r={code:null,body:null,headers:{}};r.setHeader=(k,v)=>{r.headers[k]=v;};r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};r.end=()=>r;r.send=b=>{r.body=b;return r;};return r;};
const call=async(mod,req)=>{const h=require('./build/api/'+mod+'.js').default;const res=mkRes();await h(req,res);return res;};
let pass=0,fail=0,findings=[];
const t=(id,name,cond,sev,detail='')=>{if(cond){pass++;console.log(`  PASS ${id} ${name}`);}else{fail++;console.log(`  FAIL ${id} ${name} [${sev}]`+(detail?`\n         -> ${detail}`:''));findings.push({id,name,sev,detail});}};

(async()=>{
console.log('\n== PHASE 5: ADMIN AUTHORISATION (no key / wrong key must be refused) ==');
process.env.MODERATION_KEY = 'correct-horse-battery-staple';
for (const mod of ['admin-wallets','admin-stats','moderation']) {
  let r = await call(mod, {method:'GET', headers:{}, query:{}});
  t('P5-01', `${mod}: unauthenticated GET refused`, r.code===401||r.code===403, 'P1', `got ${r.code} ${JSON.stringify(r.body).slice(0,90)}`);
  r = await call(mod, {method:'GET', headers:{'x-admin-key':'wrong'}, query:{}});
  t('P5-02', `${mod}: wrong key refused`, r.code===401||r.code===403, 'P1', `got ${r.code}`);
  r = await call(mod, {method:'GET', headers:{'x-admin-key':''}, query:{}});
  t('P5-03', `${mod}: empty key refused`, r.code===401||r.code===403, 'P1', `got ${r.code}`);
}
// grant money with no key
let r = await call('admin-wallets', {method:'POST', headers:{}, body:{walletId:'w-victim', amount:100000}, query:{}});
t('P5-04','admin-wallets: ACU grant without key refused', r.code===401||r.code===403, 'P0', `got ${r.code} ${JSON.stringify(r.body).slice(0,90)}`);

console.log('\n== PHASE 5: OPERATOR-ONLY ENDPOINTS MUST REFUSE STRANGERS ==');
// /api/economy answers "what does each SKU cost us against what we charge" —
// provider cost per top-up, per subscription month, per 3D forge, plus fixed
// overhead and the price floors. It shipped with NO auth at all, so the
// commercial position of the business was one unauthenticated GET away.
for (const mod of ['economy','traffic']) {
  const rr = await call(mod, {method:'GET', headers:{}, query:{}});
  t('P5-04b', `${mod}: no key -> refused`, rr.code===401||rr.code===403||rr.code===503, 'P1',
    `got ${rr.code} ${JSON.stringify(rr.body).slice(0,90)}`);
}

console.log('\n== PHASE 5: MODERATION_KEY unset must FAIL CLOSED, not open ==');
const saved = process.env.MODERATION_KEY; delete process.env.MODERATION_KEY;
const savedCron = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
for (const mod of ['admin-wallets','admin-stats','moderation','economy','traffic']) {
  const rr = await call(mod, {method:'GET', headers:{'x-admin-key':'anything','x-moderation-key':'anything'}, query:{}});
  t('P5-05', `${mod}: unset MODERATION_KEY fails closed`, rr.code!==200, 'P0', `got ${rr.code} — endpoint OPEN when key unset`);
}
process.env.MODERATION_KEY = saved;
if (savedCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedCron;

console.log('\n== PHASE 6: INPUT VALIDATION (forge-game) ==');
const badPrompts = [
  ['missing body', {}],
  ['empty prompt', {prompt:''}],
  ['3-char prompt', {prompt:'ab'}],
  ['null prompt', {prompt:null}],
  ['numeric prompt', {prompt:12345}],
  ['array prompt', {prompt:['x','y']}],
  ['object prompt', {prompt:{a:1}}],
  ['oversized prompt', {prompt:'x'.repeat(20001)}],
];
for (const [name, body] of badPrompts) {
  const rr = await call('forge-game', {method:'POST', headers:{}, body, query:{}});
  t('P6-01', `forge-game rejects ${name}`, rr.code===400||rr.code===402, 'P2', `got ${rr.code} ${JSON.stringify(rr.body).slice(0,80)}`);
}
const rWrongMethod = await call('forge-game', {method:'GET', headers:{}, body:{}, query:{}});
t('P6-02','forge-game rejects GET', rWrongMethod.code===405, 'P3', `got ${rWrongMethod.code}`);

console.log('\n== PHASE 6: forge-result must be WALLET-BOUND (IDOR / BOLA) ==');
const rNoTicket = await call('forge-result', {method:'GET', headers:{}, query:{}});
t('P6-03','forge-result without ticket refused', rNoTicket.code>=400, 'P2', `got ${rNoTicket.code}`);

console.log('\n== PHASE 6: forge-refund input validation ==');
for (const [name, body] of [['no ids',{}],['walletId only',{walletId:'w1'}],['forgeId only',{forgeId:'f1'}]]) {
  const rr = await call('forge-refund', {method:'POST', headers:{}, body, query:{}});
  t('P6-04', `forge-refund rejects ${name}`, rr.code===400, 'P2', `got ${rr.code}`);
}

console.log('\n== PHASE 11: ERROR RESPONSES MUST NOT LEAK INTERNALS ==');
const leaky = /(\/home\/|\/var\/task|node_modules|at Object\.|TypeError:|postgres:\/\/|DATABASE_URL|sk_live|sk_test|npg_)/;
const probes = [
  ['forge-game', {method:'POST',headers:{},body:{prompt:'x'},query:{}}],
  ['topup', {method:'POST',headers:{},body:{packageId:'nope'},query:{}}],
  ['checkout', {method:'POST',headers:{},body:{listingId:'',priceMinor:-5},query:{}}],
  ['payout', {method:'POST',headers:{},body:{amountMinor:-1,rail:'bogus'},query:{}}],
];
for (const [mod, req] of probes) {
  const rr = await call(mod, req);
  const s = JSON.stringify(rr.body ?? '');
  t('P11-01', `${mod}: error body has no internal paths/stack/secrets`, !leaky.test(s), 'P2', s.slice(0,140));
}

console.log('\n== PHASE 11: XSS / injection payloads must not be reflected raw ==');
const xss = '<img src=x onerror=alert(1)>';
const rx = await call('checkout', {method:'POST',headers:{},body:{listingId:xss,priceMinor:1000,method:'card'},query:{}});
const raw = JSON.stringify(rx.body??'');
t('P11-02','checkout: reflected listingId is JSON-encoded (not HTML context)', !raw.includes('<img src=x onerror'), 'P3', raw.slice(0,120));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (findings.length) { console.log('\n  FINDINGS:'); findings.forEach(f=>console.log(`   [${f.sev}] ${f.id} ${f.name}`)); }
process.exit(0);
})();

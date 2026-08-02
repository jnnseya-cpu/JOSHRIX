const { chromium } = require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/user/JOSHRIX/frontend';
const missing=[];
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  if(p.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"mode":"no_db"}');}
  const f=path.join(ROOT,p);
  if(fs.existsSync(f)&&fs.statSync(f).isFile()){
    const ct=p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'application/octet-stream';
    res.writeHead(200,{'Content-Type':ct}); return res.end(fs.readFileSync(f));
  }
  missing.push(p); res.writeHead(404); res.end('404');
});
srv.listen(8988, async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--proxy-bypass-list=127.0.0.1']});
  console.log('\n== MISSING LOCAL RESOURCES (real 404s) ==');
  for (const pg of ['about.html','press.html','index.html','studio.html','wallet.html','pricing.html']) {
    missing.length=0;
    const ctx=await b.newContext(); const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:8988/'+pg,{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
    const local=[...new Set(missing)];
    console.log(`  ${pg.padEnd(16)} ${local.length?'404 -> '+local.join(', '):'(none)'}`);
    await ctx.close();
  }

  console.log('\n== PHASE 5: STUDIO AUTH GATE (signed-out must be redirected) ==');
  for (const [name, setup] of [
    ['no profile at all', ()=>{}],
    ['empty profile object', ()=>{localStorage.setItem('jx.profile','{}');}],
    ['profile missing email', ()=>{localStorage.setItem('jx.profile',JSON.stringify({displayName:'X'}));}],
    ['corrupt profile json', ()=>{localStorage.setItem('jx.profile','not-json{');}],
    ['valid profile', ()=>{localStorage.setItem('jx.profile',JSON.stringify({displayName:'A',handle:'a',email:'a@b.c'}));}],
  ]) {
    const ctx=await b.newContext(); await ctx.addInitScript(setup);
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:8988/studio.html',{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
    await page.waitForTimeout(700);
    const url=page.url().split('/').pop().split('?')[0];
    const shouldPass = name==='valid profile';
    const gated = url==='login.html';
    const ok = shouldPass ? !gated : gated;
    console.log(`  ${ok?'PASS':'FAIL'}  ${name.padEnd(24)} -> ${url}${ok?'':'   <-- '+(shouldPass?'blocked a valid user':'STUDIO REACHABLE WITHOUT LOGIN')}`);
    await ctx.close();
  }

  console.log('\n== PHASE 3: MOBILE VIEWPORT (375x667) — horizontal overflow check ==');
  for (const pg of ['index.html','studio.html','pricing.html','wallet.html','login.html','arcade.html']) {
    const ctx=await b.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    await ctx.addInitScript(()=>{try{localStorage.setItem('jx.profile',JSON.stringify({displayName:'A',handle:'a',email:'a@b.c'}));}catch(e){}});
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:8988/'+pg,{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
    await page.waitForTimeout(600);
    const o=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    const overflow=o.sw-o.cw;
    console.log(`  ${overflow>4?'⚠ ':'ok'}  ${pg.padEnd(16)} scrollWidth ${o.sw} vs viewport ${o.cw}${overflow>4?'  <-- HORIZONTAL OVERFLOW '+overflow+'px':''}`);
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(0);
});

const { chromium } = require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='/home/user/JOSHRIX/frontend';
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  if(p.startsWith('/api/')){ res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({mode:'no_db',games:[],entries:[],wallets:[]})); }
  const f=path.join(ROOT,p);
  if(fs.existsSync(f)&&fs.statSync(f).isFile()){
    const ct=p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':'application/octet-stream';
    res.writeHead(200,{'Content-Type':ct}); return res.end(fs.readFileSync(f));
  }
  res.writeHead(404); res.end('404');
});
const pages=fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')).sort();
srv.listen(8977, async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--use-gl=swiftshader','--proxy-bypass-list=127.0.0.1']});
  const results=[];
  for (const pg of pages) {
    const ctx=await b.newContext({viewport:{width:1280,height:800}});
    // signed-in profile so gated pages render rather than bouncing
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('jx.profile', JSON.stringify({displayName:'Audit Tester',handle:'audit',email:'audit@test.local',acu:2000})); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[], warns=[];
    page.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+String(m.text()).slice(0,140)); });
    let status=null, redirected=null;
    try {
      const resp=await page.goto('http://127.0.0.1:8977/'+pg,{waitUntil:'domcontentloaded',timeout:20000});
      status=resp?resp.status():null;
      await page.waitForTimeout(900);
      const final=page.url().split('/').pop().split('?')[0];
      if (final!==pg) redirected=final;
      // basic content sanity
      const bodyLen=(await page.evaluate(()=>document.body?document.body.innerText.trim().length:0));
      const title=await page.title();
      const h1=await page.evaluate(()=>{const h=document.querySelector('h1,h2');return h?h.innerText.trim().slice(0,50):null;});
      results.push({pg,status,redirected,bodyLen,title:title.slice(0,45),h1,errs:[...new Set(errs)]});
    } catch(e) { results.push({pg,status:'LOAD FAIL',err:String(e.message).slice(0,90),errs}); }
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n== PHASE 3: PAGE CRAWL ('+pages.length+' pages, signed-in context) ==\n');
  let clean=0, withErr=0, empty=0;
  for (const r of results) {
    const flags=[];
    if (r.status==='LOAD FAIL') flags.push('LOAD FAIL: '+r.err);
    if (r.redirected) flags.push('redirected -> '+r.redirected);
    if (r.bodyLen!==undefined && r.bodyLen<150) { flags.push('THIN CONTENT ('+r.bodyLen+' chars)'); empty++; }
    if (r.errs && r.errs.length) { flags.push(r.errs.length+' JS error(s)'); withErr++; }
    if (!flags.length) clean++;
    console.log(`  ${(flags.length?'⚠':'ok').padEnd(3)} ${r.pg.padEnd(20)} ${String(r.status).padEnd(4)} ${String(r.bodyLen??'').padStart(6)}ch  ${flags.join(' | ')||''}`);
    if (r.errs) r.errs.slice(0,2).forEach(e=>console.log(`        ↳ ${e}`));
  }
  console.log(`\n  ${clean}/${results.length} pages clean · ${withErr} with JS errors · ${empty} thin/empty`);
  process.exit(0);
});

/* THE PATHS IN THIS FILE ONLY EVER WORKED ON ONE MACHINE.
 *
 * Until 10 Nov 2026 line 3 read `const ROOT='/home/user/JOSHRIX/frontend'` — an
 * absolute path from the container these tests were written in. It passed here
 * every time and had never run anywhere else. The CI gate added on 8 Nov went
 * red on its very first run with ENOENT on that path, and stayed red, because
 * nobody looked: the suite was green locally, which is exactly the assumption
 * the gate exists to break.
 *
 * The browser path was the same mistake twice over. `/opt/pw-browsers/chromium`
 * is this image's layout, not a universal one, and `tests/_chromium.mjs` already
 * exists to answer "where is Chromium" in one place — it was missed here because
 * this file is CommonJS and the five it replaced were ESM. Resolved by dynamic
 * import rather than a CommonJS copy of the same logic, because a second copy of
 * that answer is the original bug.
 */
const { chromium } = require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(process.env.JOSHRIX_ROOT || path.resolve(__dirname,'..'),'frontend');
if(!fs.existsSync(ROOT)){ console.error('FAIL: no frontend directory at '+ROOT+' — set JOSHRIX_ROOT to the repository root'); process.exit(1); }
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
  const { findChromium } = await import('./_chromium.mjs');
  const b=await chromium.launch({executablePath:findChromium(),args:['--no-sandbox','--use-gl=swiftshader','--proxy-bypass-list=127.0.0.1']});
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

      /* TEXT THE COLOUR OF ITS OWN BACKGROUND.
       *
       * Found on 17 Nov 2026 by screenshotting the privacy policy: EVERY <b>
       * on the legal pages was invisible. The rule was
       * `.legal b { color: var(--ink, #ececf4) }` — written as if --ink were
       * undefined and the near-white fallback would apply. --ink is defined,
       * and it is #07080B: the page background. Bold text had been rendering
       * background-on-background on privacy, terms and refunds, and the same
       * mistake sat on the docs page's table headers.
       *
       * No test could have caught it, because every one of them read the HTML.
       * The text was present, correct and in the DOM; it simply could not be
       * seen. So the check is a RENDERED one, on every page, for the whole
       * class of bug rather than for those four rules. */
      const invisible=await page.evaluate(()=>{
        const rgb=(v)=>{ const m=String(v).match(/\d+(\.\d+)?/g); return m?m.slice(0,3).map(Number):null; };
        const dist=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
        const out=[];
        for (const el of document.querySelectorAll('body *')) {
          // only elements holding their OWN text, so a container is not blamed
          const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
          if (own.length<2) continue;
          const cs=getComputedStyle(el);
          if (cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const r=el.getBoundingClientRect();
          if (r.width<2||r.height<2) continue;
          // a gradient/clipped fill is a deliberate effect, not this bug
          if (cs.webkitTextFillColor==='rgba(0, 0, 0, 0)'||cs.backgroundImage!=='none') continue;
          const fg=rgb(cs.webkitTextFillColor&&cs.webkitTextFillColor!=='rgba(0, 0, 0, 0)'?cs.webkitTextFillColor:cs.color);
          if (!fg) continue;
          // first ancestor with an opaque background decides what it sits on
          let bgEl=el, bg=null;
          while (bgEl) {
            const b=getComputedStyle(bgEl).backgroundColor;
            const a=String(b).startsWith('rgba')?Number(String(b).split(',')[3]):1;
            if (b&&b!=='transparent'&&a>0.5) { bg=rgb(b); break; }
            bgEl=bgEl.parentElement;
          }
          if (!bg) continue;
          if (dist(fg,bg)<=12) out.push({tag:el.tagName.toLowerCase(),cls:(el.className||'').toString().slice(0,30),text:own.slice(0,40),fg:fg.join(','),bg:bg.join(',')});
        }
        return out.slice(0,6);
      });

      results.push({pg,status,redirected,bodyLen,title:title.slice(0,45),h1,errs:[...new Set(errs)],invisible});
    } catch(e) { results.push({pg,status:'LOAD FAIL',err:String(e.message).slice(0,90),errs}); }
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n== PHASE 3: PAGE CRAWL ('+pages.length+' pages, signed-in context) ==\n');
  let clean=0, withErr=0, empty=0, invisibleTotal=0;
  for (const r of results) {
    const flags=[];
    if (r.status==='LOAD FAIL') flags.push('LOAD FAIL: '+r.err);
    if (r.redirected) flags.push('redirected -> '+r.redirected);
    if (r.bodyLen!==undefined && r.bodyLen<150) { flags.push('THIN CONTENT ('+r.bodyLen+' chars)'); empty++; }
    if (r.errs && r.errs.length) { flags.push(r.errs.length+' JS error(s)'); withErr++; }
    if (r.invisible && r.invisible.length) { flags.push(r.invisible.length+' INVISIBLE text run(s)'); invisibleTotal+=r.invisible.length; }
    if (!flags.length) clean++;
    console.log(`  ${(flags.length?'⚠':'ok').padEnd(3)} ${r.pg.padEnd(20)} ${String(r.status).padEnd(4)} ${String(r.bodyLen??'').padStart(6)}ch  ${flags.join(' | ')||''}`);
    if (r.errs) r.errs.slice(0,2).forEach(e=>console.log(`        ↳ ${e}`));
    if (r.invisible) r.invisible.slice(0,3).forEach(v=>console.log(`        ↳ INVISIBLE <${v.tag}${v.cls?' class="'+v.cls+'"':''}> "${v.text}" — text ${v.fg} on background ${v.bg}`));
  }
  console.log(`\n  ${clean}/${results.length} pages clean · ${withErr} with JS errors · ${empty} thin/empty · ${invisibleTotal} invisible text run(s)`);

  /* THIS FILE USED TO END IN process.exit(0) UNCONDITIONALLY.
   *
   * Every finding above — load failures, JS errors, thin pages — was printed
   * and then forgiven, so the crawl could never fail a run and the coverage
   * ratchet tracks it for presence only. That is recorded rather than changed
   * here: turning the existing findings into failures is a separate decision
   * with its own fallout, and smuggling it into a legal-copy commit would be
   * the wrong way to make it.
   *
   * Invisible text DOES fail, from today. It is a new check, it starts clean,
   * and it is the one finding where the page looks perfectly healthy to every
   * other test in this suite while a reader sees nothing at all. */
  if (invisibleTotal) {
    console.log(`\n  FAIL: ${invisibleTotal} run(s) of text rendered in the colour of their own background.`);
    process.exit(1);
  }
  process.exit(0);
});

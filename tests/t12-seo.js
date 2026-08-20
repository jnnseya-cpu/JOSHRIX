const seo=require('./build/api/_seo.js');
let pass=0,fail=0;const t=(n,c,d='')=>{c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(d?' :: '+d:'')));};

console.log('\n== AUTOMATIC INTERNAL LINKING ==');
const body=`<p>Open the JOSHRIX Studio and describe your game. Browse the Arcade for ideas, check pricing before you commit, and read how it works.</p>
<h2>Why the Studio matters</h2><p>The Studio is where creation happens.</p>
<p>Existing link: <a href="/somewhere">the Arcade</a> should not be touched.</p>
<code>the Studio in code</code>`;
const linked=seo.autoLink(body);
t('links the Studio', linked.includes('href="/studio.html"'));
t('links pricing', linked.includes('href="/pricing.html"'));
t('links how it works', linked.includes('href="/how-it-works.html"'));
t('NEVER nests an anchor inside an existing one', !/<a[^>]*>[^<]*<a /.test(linked), linked.match(/<a[^>]*>[^<]*<a [\s\S]{0,60}/)?.[0]||'');
t('never links inside a heading', !/<h2[^>]*>[\s\S]*?<a [\s\S]*?<\/h2>/.test(linked));
t('never links inside <code>', !/<code>[\s\S]*?<a /.test(linked));
const perDest=(linked.match(/href="\/studio\.html"/g)||[]).length;
t('at most ONE link per destination (no keyword stuffing)', perDest===1, 'studio links: '+perDest);
t('respects the max-links cap', (linked.match(/<a /g)||[]).length<=9);

console.log('\n  sibling-post links are injected too:');
const withSib=seo.autoLink('<p>We covered Remix Economy in an earlier piece.</p>',[{phrase:/\bRemix Economy\b/i,href:'/blog/remix-economy',title:'x'}]);
t('sibling post linked', withSib.includes('href="/blog/remix-economy"'), withSib);

console.log('\n  hostile input cannot break it:');
for (const bad of ['', '<p>', '<a href="', '<<<>>>', '<p>'+'the Studio '.repeat(500)+'</p>']) {
  let ok=true; try{ seo.autoLink(bad); }catch(e){ ok=false; }
  t(`survives ${JSON.stringify(bad.slice(0,16))}`, ok);
}

console.log('\n== STRUCTURED DATA ==');
const post={title:'How to create a game with AI',description:'A guide.',slug:'how-to',created_at:new Date().toISOString(),keywords:'ai games'};
const faqBody='<p>Intro</p><h2>FAQ</h2><h3>Is it free?</h3><p>No — AI compute costs real money, so every build is metered.</p><h3>Do I own my game?</h3><p>Yes, you keep full ownership of everything you create.</p>';
const ld=JSON.parse(seo.articleJsonLd(post,faqBody).replace(/\\u003c/g,'<'));
const types=ld['@graph'].map(n=>n['@type']);
t('emits Article', types.includes('Article'));
t('emits BreadcrumbList', types.includes('BreadcrumbList'));
t('emits Organization', types.includes('Organization'));
t('emits WebSite with search action', types.includes('WebSite'));
t('emits FAQPage when Q&A present (rich results)', types.includes('FAQPage'), types.join(','));
const faqNode=ld['@graph'].find(n=>n['@type']==='FAQPage');
t('FAQ captured both questions', faqNode.mainEntity.length===2, JSON.stringify(faqNode.mainEntity.map(q=>q.name)));
const noFaq=JSON.parse(seo.articleJsonLd(post,'<p>No questions here at all.</p>').replace(/\\u003c/g,'<'));
t('NO FAQPage when there is no real Q&A (no fake markup)', !noFaq['@graph'].map(n=>n['@type']).includes('FAQPage'));
t('script-closing sequence is neutralised', !seo.articleJsonLd(post,'<p></script><script>alert(1)</script></p>').includes('</script>'));

console.log('\n  game structured data:');
const g=JSON.parse(seo.gameJsonLd({id:'g1',title:'Crystal Quest',summary:'Collect crystals.',created_at:new Date().toISOString()}).replace(/\\u003c/g,'<'));
t('emits VideoGame schema', g['@graph'][0]['@type']==='VideoGame');
t('game url is canonical', g['@graph'][0].url.includes('/play/g1'));

console.log('\n  reading time:');
t('reads ~1 min for a short post', seo.readingMinutes('<p>'+'word '.repeat(200)+'</p>')===1);
t('scales with length', seo.readingMinutes('<p>'+'word '.repeat(2250)+'</p>')===10);
console.log('\n== EVERY REFERENCE GAME IS DISCOVERABLE ==');
/* WonderVerse shipped, was linked from the newsletter, and was never in the
   sitemap — so the strongest organic entry point on the site (a stranger can
   play it with no account) was invisible to search for weeks. A game that
   exists on disk and not in the sitemap is a game nobody finds. */
{
  const fs = require('fs'), path = require('path');
  const ROOT = process.env.JOSHRIX_ROOT || process.cwd();
  const sitemap = fs.readFileSync(path.join(ROOT, 'api', 'sitemap.ts'), 'utf8');
  const newsletter = fs.readFileSync(path.join(ROOT, 'api', 'newsletter.ts'), 'utf8');
  const arcade = fs.readFileSync(path.join(ROOT, 'frontend', 'arcade.html'), 'utf8');
  const games = fs.readdirSync(path.join(ROOT, 'frontend', 'games'))
    .filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

  t('there are reference games at all', games.length > 0);
  for (const g of games) {
    const html = fs.readFileSync(path.join(ROOT, 'frontend', 'games', g + '.html'), 'utf8');
    t(`${g}: in the sitemap`, sitemap.includes(`games/${g}`),
      'add it to STATIC_PAGES or search engines never learn it exists');
    t(`${g}: linked from the newsletter`, newsletter.includes(`/games/${g}`),
      'the weekly mail is the one channel that reaches every registered account');
    t(`${g}: on the arcade shelf`, arcade.includes(`games/${g}.html`),
      'the arcade is where a visitor goes to find something to play');
    t(`${g}: declares a canonical URL`, html.includes(`rel="canonical" href="https://www.joshrix.com/games/${g}"`));
    t(`${g}: has a meta description`, /<meta name="description" content="[^"]{60,}"/.test(html));
    t(`${g}: carries VideoGame structured data`, html.includes('"@type":"VideoGame"'));
  }
  /* cleanUrls is on and the games canonicalise to the extensionless form, so the
     sitemap must not also offer the .html spelling competing with it. */
  t('the sitemap does not list both spellings of a game',
    !/games\/[a-z0-9-]+\.html/.test(sitemap), (sitemap.match(/games\/[a-z0-9-]+\.html/) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

/**
 * EVERY PUBLISHED POST MUST SCORE 90+ ON THE RENDERED PAGE.
 *
 * "SEO optimised" was asserted in the header of api/blog-html.ts and measured
 * nowhere, which is how the blog shipped with a 512x512 app icon as its
 * og:image under a `summary_large_image` card — so every share on X rendered as
 * a grey box — and with every internal link pointing at the .html spelling that
 * cleanUrls 308-redirects.
 *
 * api/_seoscore.ts turns the claim into a number. This file drives the REAL
 * renderer against a stubbed database, scores the HTML that actually comes out,
 * and fails the suite under the floor. Scoring a hand-written fixture instead
 * would prove only that the fixture was good.
 *
 * Two scorers, one implementation, on purpose:
 *   - scoreArticleDraft() gates publication in api/blog-agent.ts, judging only
 *     what the writer controls, renormalised to 100.
 *   - scorePage() judges the finished document, including everything the
 *     renderer contributes. That is what runs here.
 *
 *   node tests/t40-blog-seo.js
 */
const led = require('./build/api/_ledger.js');
const { scorePage, scoreArticleDraft, scoreReport, MIN_SCORE } = require('./build/api/_seoscore.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ---------------------------------------------------------------------------
 * A representative article: the shape the Content Agent is instructed to write.
 * Deliberately NOT pre-linked and NOT pre-anchored — the renderer's auto-linker
 * and heading anchors have to do that work, which is precisely what is under
 * test. If this fixture arrived already optimised the test would pass on a
 * renderer that did nothing at all.
 * ------------------------------------------------------------------------- */
const ARTICLE = {
  slug: 'what-does-an-ai-game-costs',
  title: 'What does it cost to make a game with AI?',
  description: 'A finished 2D game costs about £0.32 of metered compute and a 3D game about £0.49 — and you are charged only for builds you keep. The full breakdown.',
  keywords: 'ai game cost, make a game with ai, ai game generator pricing',
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-08T11:00:00.000Z',
  html: `
<p>A finished 2D game costs about £0.32 of metered compute and a 3D game about £0.49, charged from real token usage rather than a flat quota. You are charged only if you keep the build, so a game you refine, discard or walk away from costs you nothing at all. That single rule is the difference between experimenting freely and rationing your ideas.</p>
<h2>How the pricing actually works</h2>
<p>Credit is bought in ACUs at one penny each, from a £5 pack upwards. A build places a hold against your balance, the run settles against what it really consumed, and the remainder returns the moment it lands. There is no monthly quota to burn through, nothing expires, and there is no tier that quietly throttles you once you pass a threshold.</p>
<p>The hold exists because nobody knows in advance how much work a concept will take. A one-screen arcade loop and a five-level driving game are not the same job, and pretending otherwise means either overcharging the small one or losing money on the large one. Metering from real usage is the honest version, and the settlement is visible in your ledger rather than summarised at the end of a month.</p>
<ul>
<li>2D build: about £0.32 of metered compute</li>
<li>3D build: about £0.49 of metered compute</li>
<li>Marketing assets from the growth tools: about £0.05 each</li>
<li>A build you discard: nothing at all</li>
</ul>
<h2>What you actually get for that</h2>
<p>A real game that runs in a browser tab on a phone or a desktop, built against a library of game-ready CC0 models and sprites that ships with every account. No engine to learn, no plugin to install, and nothing to download for the person you send it to. The output is a URL, which is the whole point: a game nobody can play because they will not install a 90MB package is not a game, it is a project folder.</p>
<p>The library matters more than it sounds. Most tools in this category hand you a prompt box and leave you to source art, which is where a weekend project dies. Here the models, the sprites, the animation clips and the audio are already there, already licensed, and already load-tested in a real browser before they shipped.</p>
<h2>How it compares to hiring the work out</h2>
<p>A freelance developer building the same browser prototype quotes in days, not pence, and a small studio quotes in weeks. The honest comparison is not quality — a commissioned game will be better made, by a person who can argue with your brief. The comparison is about when you find out whether the idea is worth commissioning at all.</p>
<p>Most game ideas are dull in the first ninety seconds and there is no way to know which ones from the pitch. Spending a month to discover that is expensive; spending the price of a coffee is not. Treat the first build as a question rather than a product and the economics stop being a comparison at all.</p>
<h2>What the platform takes when you sell</h2>
<p>Commission starts at 25% and falls to 7.5% as you scale. For comparison, the large storefronts take 30% and a well-known creation platform keeps roughly three quarters once its currency is converted. Creator earnings clear before withdrawal, and you keep the rights to everything you make — the platform takes a share of sales, never a stake in the work.</p>
<p>Publishing is gated on human review, which is what keeps the catalogue store-compliant and age-appropriate. Private playtesting before that gate is unlimited and free, so you can iterate as many times as you like and only involve a reviewer when you have something you would put your name on.</p>
<h2>Is it worth it for a first game?</h2>
<p>For the price of a coffee you find out whether the concept plays. That is the case for it, and it is the only case worth making. If the answer is no, you have lost about thirty pence and an afternoon. If the answer is yes, you have a playable thing you can send to ten people before you have spent anything that would make you defensive about the feedback.</p>
<p>The failure mode to avoid is treating the first output as finished. It is a prototype with a share link, and the value is in what the first ten players tell you, not in what came back from the first run.</p>
<h2>FAQ</h2>
<h3>Do I pay for a build that fails?</h3>
<p>No. You are charged only when you keep a build — publishing it, or spending an enhance pass on it, is the only thing that collects payment. Refine it, discard it or close the tab and the entire hold returns to your balance.</p>
<h3>Do I own the game I make?</h3>
<p>Yes. The creator holds the rights outright; the platform takes commission on sales and never a stake in the work itself. The included assets are CC0, so there is no attribution burden on what you ship, and the game is not locked to the platform.</p>
<h3>What happens if the AI is having a bad day?</h3>
<p>Every build is attempted across three independent providers in turn, and a build that does not parse, does not draw, or contains no actual game loop is rejected server-side before you ever see it. A build that only sets up a world and forgets the gameplay is thrown away rather than delivered.</p>
<h3>Can I make a game in a language other than English?</h3>
<p>Yes. Describe it in your own language and every player-facing string is written in that language at blueprint time rather than translated afterwards, which is why the result reads like it was written rather than run through a converter.</p>
<p>Ready to find out what your idea plays like? Describe it and see what comes back — the first build costs about the same as a coffee, and you only pay if you keep it.</p>`,
};

/* ---------- a database that stores what the renderer asks for ---------- */
const posts = new Map([[ARTICLE.slug, ARTICLE]]);
const SIBLINGS = [
  ['metered-compute-explained', 'Metered compute, explained'],
  ['browser-game-share-link', 'Why a browser game beats a download'],
  ['human-review-explained', 'What human review actually checks'],
  ['creator-earnings-guide', 'How creator earnings clear and pay out'],
  ['cc0-model-library-tour', 'A tour of the CC0 model library'],
  ['enhance-pass-guide', 'When to spend an enhance pass'],
];
SIBLINGS.forEach(([slug, title], i) => {
  posts.set(slug, { ...ARTICLE, slug, title, created_at: `2026-08-0${i + 1}T09:00:00.000Z` });
});
const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();
  if (/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/i.test(q)) return Promise.resolve([]);
  if (/FROM blog_posts WHERE slug/i.test(q)) {
    const p = posts.get(vals[0]);
    return Promise.resolve(p ? [p] : []);
  }
  if (/FROM blog_posts/i.test(q)) {
    return Promise.resolve([...posts.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
  }
  return Promise.resolve([]);
};
led.__setDbForTests(fake);
const blogHtml = require('./build/api/blog-html.js').default;

const render = async (slug) => {
  let body = '', code = 0;
  const res = {
    setHeader() {}, statusCode: 0,
    status(c) { code = c; return res; },
    send(b) { body = b; return res; },
    end(b) { if (b) body = b; return res; },
    json(b) { body = JSON.stringify(b); return res; },
  };
  await blogHtml({ method: 'GET', query: { slug }, headers: {} }, res);
  return { html: body, code };
};

(async () => {

const { html, code } = await render(ARTICLE.slug);

console.log('\nthe renderer produced a page');
t('it answered 200', code === 200, String(code));
t('it is a complete document', /^<!DOCTYPE html>/i.test(html) && html.includes('</html>'));

/* ================================================================= *
 * THE SCORE
 * ================================================================= */
const score = scorePage(html, 'ai game cost');
console.log('\n' + scoreReport(score).split('\n').map((l) => '  ' + l).join('\n'));

console.log('\nthe rendered page clears the floor');
t(`scores at least ${MIN_SCORE}/100 (got ${score.total})`, score.total >= MIN_SCORE, scoreReport(score));
t('grade A', score.grade === 'A', score.grade);

/* Every individual category, so a failure names the thing to fix rather than
   just a lower number. */
console.log('\nno single check is failing');
for (const c of score.checks) {
  t(`${c.id} (${c.weight})`, c.got === 1, c.note);
}

/* ================================================================= *
 * THE THINGS THAT WERE ACTUALLY BROKEN
 * ================================================================= */
console.log('\nthe defects this file was written for');
t('og:image is the 1200x630 card, not the 512 app icon',
  html.includes('og:image" content="https://www.joshrix.com/assets/og-cover.png'),
  'a square icon under summary_large_image renders as a grey box on X');
t('no internal link points at a redirecting .html URL',
  !/href="\/[a-z0-9-]+\.html"/.test(html),
  (html.match(/href="\/[a-z0-9-]+\.html"/) || [''])[0]);
t('the dead starfield canvas is gone', !html.includes('id="stars"'));
t('dateModified differs from datePublished when the post was edited',
  html.includes('article:modified_time') && !html.includes(`article:modified_time" content="${ARTICLE.created_at}`));

console.log('\nthe answer-engine surface');
t('an extractable answer block is marked up', html.includes('class="jx-answer"'),
  'this is the passage an AI engine lifts and cites');
t('speakable names that block', /"speakable"/.test(html) && html.includes('.jx-answer'));
t('BlogPosting, not bare Article', html.includes('"@type":"BlogPosting"'));
t('FAQPage is emitted from the real Q&A', html.includes('"@type":"FAQPage"'));
t('a named author, not the company', html.includes('#editorial'));

console.log('\ndynamic hyperlinks');
const bodyOnly = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [, ''])[1];
const bodyLinks = (bodyOnly.match(/<a\s/g) || []).length;
t(`the auto-linker placed many links (${bodyLinks})`, bodyLinks >= 8, `${bodyLinks} in the article body`);
const dests = new Set((bodyOnly.match(/href="([^"]+)"/g) || []).map((h) => h));
t(`they go to distinct destinations (${dests.size})`, dests.size >= 6);
t('at least one points at a sibling post', /href="\/blog\/[a-z-]+"/.test(bodyOnly),
  'post-to-post links are what build topical authority');
t('no anchor is nested inside another', !/<a[^>]*>[^<]*<a /.test(bodyOnly));
t('a table of contents was generated', html.includes('class="toc"'));
t('every h2 got an anchor id', (bodyOnly.match(/<h2[^>]*\sid="/g) || []).length >= 5);
t('prev/next sequence links exist', html.includes('class="seq"'));
t('a visible breadcrumb backs the JSON-LD one', html.includes('class="crumbs"'));

/* ================================================================= *
 * THE PUBLICATION GATE
 * ================================================================= */
console.log('\nthe gate refuses what it should');
{
  /* The gate judges what the WRITER produced, and the Content Agent is
     instructed to place 5-8 internal links itself. ARTICLE above is deliberately
     link-free so the renderer's auto-linker has something to prove, so it is not
     the right fixture here — a draft that shipped with no links at all SHOULD be
     marked down, and is. This is that same article as the agent would hand it
     over. */
  const withLinks = ARTICLE.html
    .replace('bought in ACUs', 'bought in <a href="/pricing">ACUs</a>')
    .replace('runs in a browser tab', 'runs in a <a href="/arcade">browser tab</a>')
    .replace('library of game-ready CC0 models', 'library of <a href="/library">game-ready CC0 models</a>')
    .replace('Commission starts at 25%', '<a href="/pricing">Commission</a> starts at 25%')
    .replace('gated on human review', 'gated on <a href="/how-it-works">human review</a>')
    .replace('you keep the rights to everything you make', 'you keep <a href="/ip-registry">the rights to everything you make</a>')
    .replace('three independent providers', '<a href="/agent-fleet">three independent providers</a>')
    .replace('Describe it and see what comes back', '<a href="/studio">Describe it and see what comes back</a>');
  const good = scoreArticleDraft({
    title: ARTICLE.title, metaDescription: ARTICLE.description,
    keywords: ARTICLE.keywords, html: withLinks,
  });
  t(`a draft as the agent writes it passes the gate (${good.total}/100)`,
    good.total >= MIN_SCORE, scoreReport(good));

  const unlinked = scoreArticleDraft({
    title: ARTICLE.title, metaDescription: ARTICLE.description,
    keywords: ARTICLE.keywords, html: ARTICLE.html,
  });
  t(`the same article with NO links is marked down (${unlinked.total}/100)`,
    unlinked.total < good.total,
    'the writer is asked for 5-8 internal links; a draft without them is not finished');

  const stub = scoreArticleDraft({
    title: 'A post', metaDescription: 'Short.', keywords: 'x',
    html: '<p>This article was generated by the offline demo agent.</p><h2>Start forging</h2><p>Go to the studio.</p>',
  });
  t(`the offline stub is refused (${stub.total}/100)`, stub.total < MIN_SCORE,
    'publishing a thin post competes with the archive for crawl budget and cannot be cheaply un-indexed');

  t('the draft scorer never credits work the renderer does',
    !good.checks.some((c) => c.id === 'schema-article' || c.id === 'og-image' || c.id === 'canonical'),
    'crediting the template would hand every draft the same free points and make the floor meaningless');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();

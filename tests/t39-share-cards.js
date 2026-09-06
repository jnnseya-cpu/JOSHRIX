/**
 * EVERY PUBLIC PAGE MUST HAVE A CANONICAL URL AND A SHARE CARD.
 *
 * An audit on 6 Sep found that of 32 pages, exactly TWO carried a canonical and
 * ZERO carried any Open Graph tag at all. The three reference games had full
 * cards; the entire marketing site had none.
 *
 * That is not a cosmetic gap. index.html argues that JOSHRIX wins "the queue,
 * the group chat, the fanbase drop" — a link someone pastes to a friend IS the
 * acquisition strategy, and every one of those links unfurled as bare blue text
 * in WhatsApp, Discord, X, LinkedIn and Slack. The one surface the whole plan
 * depends on was the one surface with no design on it.
 *
 * The canonical half matters for a different reason: vercel.json sets cleanUrls,
 * so /pricing and /pricing.html both resolve. Worse, the two pages that DID have
 * canonicals pointed at the .html spelling, which 308-redirects to the
 * extensionless one — telling a crawler the real page was the redirect. Two
 * conflicting canonicals is worse than none: Google discards both.
 *
 * Regenerate with `node tools/seo-head.mjs`; this file is what stops a new page
 * shipping without one.
 *
 *   node tests/t39-share-cards.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'frontend');
const SITE = 'https://www.joshrix.com';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/** Personal or operational surfaces. Indexing them puts a user's own wallet
 *  into search results and spends a small site's crawl budget on empty shells. */
const NOINDEX = new Set(['admin', 'dashboard', 'profile', 'wallet', 'login']);
/** One file serving many URLs. /play/:id and doc.html?d=<SPEC> — a static
 *  canonical here would declare every game, or every spec, to be one page. */
const TEMPLATES = new Set(['play', 'doc']);

const pages = fs.readdirSync(WEB).filter((f) => f.endsWith('.html')).sort();

console.log('\nthere are pages to check');
t('the frontend has pages', pages.length > 25, `found ${pages.length}`);

console.log('\nevery page carries a share card');
for (const file of pages) {
  const slug = file.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(WEB, file), 'utf8');

  for (const tag of ['og:title', 'og:description', 'og:image', 'og:type', 'og:site_name']) {
    t(`${slug}: ${tag}`, html.includes(`property="${tag}"`), 'run tools/seo-head.mjs');
  }
  t(`${slug}: twitter:card is summary_large_image`,
    html.includes('name="twitter:card" content="summary_large_image"'));

  /* A relative og:image is ignored by every unfurler — it has no page context to
     resolve against. This is the single most common way a card silently fails. */
  const img = (html.match(/property="og:image" content="([^"]*)"/) || [, ''])[1];
  t(`${slug}: og:image is absolute`, img.startsWith('https://'), img || 'missing');

  /* Dimensions let a platform reserve the space before the image loads, which
     is the difference between a card that appears and one that pops in late. */
  t(`${slug}: og:image declares its size`,
    html.includes('property="og:image:width" content="1200"') &&
    html.includes('property="og:image:height" content="630"'));
}

console.log('\ncanonicals point at the URL cleanUrls actually serves');
for (const file of pages) {
  const slug = file.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(WEB, file), 'utf8');
  const found = html.match(/rel="canonical" href="([^"]*)"/g) || [];

  if (TEMPLATES.has(slug)) {
    t(`${slug}: template declares NO canonical`, found.length === 0,
      'one file serves many URLs — a static canonical collapses them all onto one');
    continue;
  }
  t(`${slug}: exactly one canonical`, found.length === 1, `found ${found.length}`);
  if (found.length !== 1) continue;

  const href = found[0].match(/href="([^"]*)"/)[1];
  const want = slug === 'index' ? `${SITE}/` : `${SITE}/${slug}`;
  t(`${slug}: canonical is ${want}`, href === want, href);
  t(`${slug}: canonical is extensionless`, !href.endsWith('.html'),
    'cleanUrls 308-redirects the .html form, so this names the redirect');
}

console.log('\nprivate surfaces are not indexed, public ones are');
for (const file of pages) {
  const slug = file.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(WEB, file), 'utf8');
  const noindex = /name="robots" content="[^"]*noindex/.test(html);
  if (NOINDEX.has(slug)) {
    t(`${slug}: noindex`, noindex, 'a personal page must not enter the index');
  } else {
    t(`${slug}: indexable`, !noindex, 'a marketing page must not carry noindex');
  }
}

console.log('\nthe share image exists and is the size it claims');
{
  const og = path.join(WEB, 'assets', 'og-cover.png');
  t('assets/og-cover.png exists', fs.existsSync(og), 'run tools/make-og-image.mjs');
  if (fs.existsSync(og)) {
    const buf = fs.readFileSync(og);
    /* PNG header: width and height are big-endian uint32 at bytes 16 and 20. */
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    t('it is 1200x630', w === 1200 && h === 630, `${w}x${h}`);
    const kb = Math.round(buf.length / 1024);
    t(`it is light enough to unfurl (${kb} KB)`, kb < 900, `${kb} KB`);
    /* WebP is still rejected as an og:image by X and LinkedIn in 2026. */
    t('it is a PNG, not WebP', buf.slice(1, 4).toString() === 'PNG');
  }
}

console.log('\nthe sitemap agrees with the canonicals');
{
  const src = fs.readFileSync(path.join(ROOT, 'api/sitemap.ts'), 'utf8');
  const i = src.indexOf('const STATIC_PAGES');
  /* Strip the comments first. This block explains WHY the entries are
     extensionless by quoting "/pricing.html" as the thing that was wrong, and a
     checker that reads its own explanation as data reports the defect it
     documents — the third time this exact trap has appeared in this suite. */
  const block = src.slice(i, src.indexOf('];', i))
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const listed = (block.match(/"([^"]*)"/g) || []).map((s) => s.slice(1, -1));

  t('no sitemap entry uses the .html spelling',
    !listed.some((p) => p.endsWith('.html')),
    (listed.find((p) => p.endsWith('.html')) || '') + ' redirects to its canonical');

  /* A public page absent from the sitemap is a page a crawler finds only by
     following a link, if one exists. /growth carried a canonical and was
     missing from this list entirely. */
  for (const slug of ['growth', 'signup', 'studio', 'library', 'pricing', 'arcade']) {
    t(`the sitemap lists ${slug}`, listed.includes(slug));
  }
  for (const slug of NOINDEX) {
    t(`the sitemap does NOT list ${slug}`, !listed.includes(slug),
      'it is noindex — listing it asks a crawler to fetch a page we told it to ignore');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/**
 * GET /features — the pillar page for the feature cluster.
 *
 * Search engines reward a topic that is covered properly and linked coherently:
 * one hub that links to every article, and every article linking back. Without
 * the hub, feature posts are orphans competing with each other; with it they
 * accumulate into one subject the site is visibly authoritative on.
 *
 * The page is generated from api/_features.ts, so it can never drift from the
 * capability list the Content Agent writes about. Articles appear as links the
 * moment the agent publishes them, and until then each capability still gets an
 * indexed entry pointing at the product page that delivers it — so the hub is
 * useful on day one rather than only once the archive fills.
 */
import { FEATURES, FEATURE_GROUPS, LIBRARY, n as num } from "./_features";
import { getDb } from "./_ledger";
import { listBlogPosts } from "./_ledger";

const SITE = "https://www.joshrix.com";

const esc = (s: string) =>
  String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

export default async function handler(_req: any, res: any) {
  // Articles are matched to capabilities by slug overlap; a missing archive
  // must degrade to "no article yet", never to an error page.
  let posts: Array<{ slug: string; title: string }> = [];
  try {
    const sql = getDb();
    if (sql) posts = (await listBlogPosts(sql, 200)) as any[];
  } catch { /* the hub is useful without the archive */ }

  function articleFor(id: string) {
    const words = id.split("-").filter((w) => w.length > 3);
    return posts.find((p) => {
      const s = String(p.slug ?? "");
      return words.filter((w) => s.includes(w)).length >= Math.min(2, words.length);
    });
  }

  const sections = FEATURE_GROUPS.map((group) => {
    const items = FEATURES.filter((f) => f.group === group);
    if (!items.length) return "";
    const cards = items.map((f) => {
      const post = articleFor(f.id);
      const readMore = post
        ? `<a class="fx-read" href="${SITE}/blog/${esc(post.slug)}">Read: ${esc(post.title)}</a>`
        : `<span class="fx-soon">In-depth article coming</span>`;
      return `<article class="fx-card" id="${esc(f.id)}">
  <h3><a href="${esc(f.href)}">${esc(f.name)}</a></h3>
  <ul>${f.proof.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  <div class="fx-links"><a class="fx-go" href="${esc(f.href)}">See it →</a>${readMore}</div>
</article>`;
    }).join("\n");
    return `<section class="fx-group"><h2>${esc(group)}</h2><div class="fx-grid">${cards}</div></section>`;
  }).join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "What JOSHRIX Studio does",
        url: `${SITE}/features`,
        description: "Every capability of the JOSHRIX Studio AI game platform, with the specifics behind each one.",
        isPartOf: { "@type": "WebSite", name: "JOSHRIX Studio", url: SITE },
      },
      {
        "@type": "ItemList",
        itemListElement: FEATURES.map((f, i) => ({
          "@type": "ListItem", position: i + 1, name: f.name, url: `${SITE}/features#${f.id}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE },
          { "@type": "ListItem", position: 2, name: "Features", item: `${SITE}/features` },
        ],
      },
    ],
  };

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>What JOSHRIX Studio Does — Every Feature, With The Specifics</title>
<meta name="description" content="Every capability of JOSHRIX Studio: ${num(LIBRARY.models)} 3D models and ${num(LIBRARY.sprites)} sprites included, metered pricing from £0.32 a game, 75-92.5% revenue share, mobile-money payouts, and refunds on failed builds.">
<link rel="canonical" href="${SITE}/features">
<meta property="og:type" content="website">
<meta property="og:title" content="What JOSHRIX Studio Does — Every Feature">
<meta property="og:url" content="${SITE}/features">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#050508">
<link rel="stylesheet" href="/assets/joshrix.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  .fx-wrap{max-width:1100px;margin:0 auto;padding:0 1rem 4rem}
  .fx-group{margin-top:2.6rem}
  .fx-group h2{font-size:1.05rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#9d9db3)}
  .fx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.1rem;margin-top:1rem}
  .fx-card{border:1px solid var(--stroke,#26263a);border-radius:14px;padding:1.1rem 1.2rem;background:rgba(255,255,255,.02)}
  .fx-card h3{margin:0 0 .6rem;font-size:1.05rem;line-height:1.35}
  .fx-card h3 a{color:var(--text,#e7e7f2);text-decoration:none}
  .fx-card h3 a:hover{color:var(--cyan,#22D3EE)}
  .fx-card ul{margin:0;padding-left:1.05rem;color:var(--muted,#9d9db3);font-size:.9rem;line-height:1.6}
  .fx-links{display:flex;gap:.9rem;flex-wrap:wrap;margin-top:.9rem;font-size:.85rem}
  .fx-go{color:var(--cyan,#22D3EE);text-decoration:none;font-weight:600}
  .fx-read{color:#a78bfa;text-decoration:none}
  .fx-soon{color:var(--muted,#9d9db3);opacity:.7}
</style></head><body>
<canvas id="stars" aria-hidden="true"></canvas><div class="noise" aria-hidden="true"></div>
<nav class="jx">
  <a class="brand" href="/"><span class="word">JOSHRIX<em>STUDIO</em></span></a>
  <ul class="nav-links">
    <li><a href="/arcade">Arcade</a></li><li><a href="/marketplace">Marketplace</a></li>
    <li><a href="/pricing">Pricing</a></li><li><a href="/blog">Blog</a></li>
  </ul>
  <div class="nav-right"><a class="btn btn-primary btn-sm" href="/studio">Launch Studio</a></div>
</nav>
<main class="fx-wrap">
  <div class="page-hero">
    <div class="sec-tag">Features</div>
    <h1 class="jx">Everything JOSHRIX Studio does, <span class="grad">with the specifics</span></h1>
    <p class="lede">No adjectives without a number behind them. Each capability below links to the page that delivers it, and to the article that explains it in full.</p>
    <p><a class="btn btn-primary" href="/games/dino-island">▶ Play a game made here — no account</a></p>
  </div>
  ${sections}
  <section class="fx-group">
    <h2>Start</h2>
    <p class="lede">The first game is free — a verified account starts with 2,000 ACUs, about 60 complete 2D games.
    <a href="/studio">Open the Studio</a>, browse finished worlds in the <a href="/arcade">Arcade</a>,
    or read the <a href="/blog">blog</a>.</p>
  </section>
</main>
<script src="/assets/appnav.js"></script>
<script src="/assets/config.js"></script>
<script src="/assets/track.js"></script>
<script src="/assets/pixels.js"></script>
<script src="/assets/consent.js" defer></script>
<script src="/assets/site.js"></script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
  return res.status(200).send(html);
}

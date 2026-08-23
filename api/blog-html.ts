/**
 * GET /api/blog-html?slug=<slug> — serves /blog/<slug> as FULL server-rendered
 * HTML (not JSON): crawlers and social scrapers get real meta tags — title,
 * meta description, keywords, canonical, OpenGraph + Twitter cards, JSON-LD
 * Article schema — plus the article body with its internal links. This is what
 * gets JOSHRIX pages ranked and unfurling nicely when shared.
 */
import { getDb, ensureBlogSchema, getBlogPost, listBlogPosts, blogViews } from "./_ledger";
import { autoLink, articleJsonLd, readingMinutes } from "./_seo";

const SITE = "https://www.joshrix.com";
const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const slug = String(req.query?.slug ?? "");
  const sql = getDb();
  if (!sql || !/^[a-z0-9-]{3,80}$/.test(slug)) return notFound(res);

  try {
    await ensureBlogSchema(sql);
    const post = await getBlogPost(sql, slug);
    if (!post) return notFound(res);
    const all = await listBlogPosts(sql, 60);
    /* Read BEFORE this request's own beacon fires, so the number a reader sees
       is the count of everyone before them rather than one that ticks over as
       they arrive. Failure is silent: a missing count hides the line, it never
       costs the article. */
    let views = 0;
    try { views = (await blogViews(sql, [slug]))[slug] ?? 0; } catch { /* show no count */ }
    const others = all.filter((p) => p.slug !== slug);
    const url = `${SITE}/blog/${post.slug}`;
    const published = new Date(post.created_at).toISOString();

    // model-written HTML: strip anything executable before it reaches the page
    const sanitised = String(post.html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<script[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, '$1=$2#');

    // AUTOMATIC INTERNAL LINKING. The model is asked to add links but cannot be
    // relied on to, so the server adds them from the article's own wording:
    // platform pages plus up to four sibling posts whose titles are mentioned.
    const siblingTargets = others.slice(0, 12).map((p: any) => ({
      phrase: new RegExp("\\b" + String(p.title).split(/[:\u2014-]/)[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"),
      href: `/blog/${p.slug}`,
      title: p.title,
    })).filter((t: any) => t.phrase.source.length > 12);
    const safeHtml = autoLink(sanitised, siblingTargets, 8);
    const mins = readingMinutes(safeHtml);

    // Article + BreadcrumbList + Organization + WebSite, and FAQPage when the
    // post contains real Q&A — FAQPage is what earns expandable rich results.
    const jsonLd = articleJsonLd(post, safeHtml);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(post.title)} — JOSHRIX Blog</title>
<meta name="description" content="${esc(post.description)}">
${post.keywords ? `<meta name="keywords" content="${esc(post.keywords)}">` : ""}
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="JOSHRIX Studio">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(post.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/icons/icon-512.png">
<meta property="article:published_time" content="${published}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(post.description)}">
<meta name="twitter:image" content="${SITE}/assets/icons/icon-512.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#050508">
<link rel="apple-touch-icon" href="/assets/icons/icon-180.png">
<link rel="alternate" type="application/rss+xml" title="JOSHRIX Blog" href="${SITE}/feed.xml">
<script type="application/ld+json">${jsonLd}</script>
<link rel="stylesheet" href="/assets/joshrix.css">
<script src="/assets/config.js"></script>
<!-- THE REASON BLOG VIEW COUNTS WERE ALWAYS ZERO. Every page under frontend/
     loads track.js, but this page is generated here and never did, so no post
     has ever reported a view. blog.html (the index) was counted; the articles
     themselves were invisible. -->
<script src="/assets/track.js"></script>
<script src="/assets/pixels.js"></script>
<script src="/assets/consent.js" defer></script>
<style>
  .post{max-width:760px;margin:0 auto;padding:0 1rem 3rem}
  .post h1{font-size:clamp(1.6rem,4.5vw,2.4rem);line-height:1.2;margin:.4rem 0 .6rem}
  .post .meta{color:var(--muted,#9d9db3);font-size:.85rem;letter-spacing:.05em;text-transform:uppercase}
  .post article{margin-top:1.6rem}
  .post article p,.post article li{color:var(--muted,#c9c9d6);line-height:1.8;font-size:1.02rem;margin:.8rem 0}
  .post article h2{font-size:1.35rem;margin:2rem 0 .6rem}
  .post article h3{font-size:1.08rem;margin:1.4rem 0 .4rem}
  .post article a{color:#22D3EE}
  .post article ul{padding-left:1.3rem}
  .more{border-top:1px solid var(--stroke,#26263a);margin-top:2.6rem;padding-top:1.4rem}
  .more a{display:block;color:#22D3EE;text-decoration:none;margin:.45rem 0}
</style>
</head>
<body>
<canvas id="stars" aria-hidden="true"></canvas>
<div class="noise" aria-hidden="true"></div>
<nav class="jx">
  <a class="brand" href="/index.html">
    <svg viewBox="-50 -50 100 100"><defs><linearGradient id="jxG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#22D3EE"/></linearGradient></defs><polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="none" stroke="url(#jxG)" stroke-width="7" stroke-linejoin="round"/><polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="url(#jxG)"/></svg>
    <span class="word">JOSHRIX<em>STUDIO</em></span>
  </a>
  <ul class="nav-links">
    <li><a href="/blog.html">Blog</a></li>
    <li><a href="/arcade.html">Arcade</a></li>
    <li><a href="/pricing.html">Pricing</a></li>
  </ul>
  <div class="nav-right"><a class="btn btn-primary btn-sm" href="/studio.html">Launch Studio</a></div>
</nav>
<main class="jx post">
  <p class="meta">JOSHRIX Blog · ${new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · ${mins} min read${views > 0 ? ` · ${views.toLocaleString("en-GB")} ${views === 1 ? "view" : "views"}` : ""}</p>
  <h1>${esc(post.title)}</h1>
  <article>${safeHtml}</article>
  ${others.length ? `<div class="more"><h2 style="font-size:1.1rem">Keep reading</h2>${others.slice(0, 6).map((p: any) => `<a href="/blog/${esc(p.slug)}">${esc(p.title)}</a>`).join("")}<p style="margin-top:1rem"><a href="/blog.html">All articles</a> · <a href="/studio.html">Create your own game</a> · <a href="/arcade.html">Play free games</a></p></div>` : `<div class="more"><p><a href="/blog.html">All articles</a> · <a href="/studio.html">Create your own game</a></p></div>`}
</main>
<div class="foot-base" style="justify-content:center;gap:1.4rem;display:flex;flex-wrap:wrap;padding:1.5rem">
  <span>© 2026 JOSHRIX Studio</span>
  <a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/refunds.html">Refunds</a>
</div>
<script src="/assets/site.js"></script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(200).send ? res.status(200).send(html) : (res.status(200), res.end(html));
  } catch {
    return notFound(res);
  }
}

function notFound(res: any) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Post not found — JOSHRIX</title><meta name="robots" content="noindex"></head><body style="background:#050508;color:#ececf4;font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center"><p>Post not found — <a style="color:#22D3EE" href="/blog.html">back to the blog</a></p></body></html>`;
  res.statusCode = 404;
  return res.send ? res.send(body) : res.end(body);
}

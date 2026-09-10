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


/**
 * Give every <h2>/<h3> a stable id and return the table of contents.
 *
 * Two jobs. For a reader it is navigation on a 1,200-word page. For a search
 * engine it is what produces the "Jump to" links under a result, and for an
 * answer engine it is a map of the page's sub-questions — an anchor per section
 * is the difference between a page that can be cited at a specific claim and
 * one that can only be cited whole.
 */
function withAnchors(html: string): { html: string; toc: Array<{ id: string; text: string; level: number }> } {
  const toc: Array<{ id: string; text: string; level: number }> = [];
  const seen = new Set<string>();
  const out = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, lvl, attrs, inner) => {
    const label = String(inner).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    let id = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    if (!id) id = "section";
    let n = 2; const base = id;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    toc.push({ id, text: label, level: Number(lvl) });
    /* The existing attributes are kept: the writer may already have set a
       class, and silently dropping it would be a rendering bug that only shows
       up on one post in twenty. */
    return `<h${lvl}${attrs} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

/**
 * The passage an answer engine lifts.
 *
 * Engines composing a reply quote a self-contained sentence that answers the
 * query, with a citation. If the page opens with three paragraphs of throat
 * clearing there is nothing to lift, and the citation goes to whoever did put a
 * direct answer near the top. This promotes the article's own first paragraph
 * into a marked block — it does not invent one, so a post that buries its answer
 * still reads honestly, it just scores and cites worse.
 */
function answerPassage(html: string): string {
  const first = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!first) return "";
  const plain = first[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return plain.length >= 80 ? plain : "";
}

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
    const modified = new Date((post as any).updated_at ?? post.created_at).toISOString();

    // model-written HTML: strip anything executable before it reaches the page
    const sanitised = String(post.html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<script[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, '$1=$2#');

    // AUTOMATIC INTERNAL LINKING. The model is asked to add links but cannot be
    // relied on to, so the server adds them from the article's own wording:
    // platform pages plus up to four sibling posts whose titles are mentioned.
    /* SIBLING LINKING, in two passes, because prose matching alone does not work.
       The original built a pattern from a sibling's whole title, so a post only
       linked to another post if it quoted that headline verbatim — which
       essentially never happens, and the "deep interlinking" strategy placed
       almost no post-to-post links at all. Widening it to a run of significant
       words did not fix it either: "browser game beats a download" has a
       stopword inside the run, and "CC0 model library" appears in the prose as
       "CC0 models". Fuzzy-matching headlines against prose is the wrong tool.

       Pass 1 keeps the cheap win: if the article really does say a sibling's
       title, link it. Pass 2 is the reliable one — a Related reading block
       chosen by keyword overlap, rendered INSIDE <article> so those links are
       body content rather than boilerplate a crawler discounts. */
    const titleTargets = others.slice(0, 24).map((p: any) => ({
      phrase: new RegExp("\\b" + String(p.title).split(/[:\u2014-]/)[0].trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"),
      href: `/blog/${p.slug}`,
      title: p.title,
    })).filter((t: any) => t.phrase.source.length > 12);

    /** Siblings ranked by how many keywords they share with this post. */
    const terms = (v: unknown) =>
      new Set(String(v ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    const mine = terms(`${post.keywords ?? ""} ${post.title}`);
    const related = others
      .map((p: any) => {
        const theirs = terms(`${p.keywords ?? ""} ${p.title}`);
        let overlap = 0;
        theirs.forEach((w: string) => { if (mine.has(w)) overlap++; });
        return { post: p, overlap };
      })
      .sort((a, b) => b.overlap - a.overlap || String(b.post.created_at).localeCompare(String(a.post.created_at)))
      .slice(0, 5)
      .map((r) => r.post);

    const safeHtml = autoLink(sanitised, titleTargets, 18);
    const anchored = withAnchors(safeHtml);
    const bodyHtml = anchored.html;
    const toc = anchored.toc.filter((h) => h.level === 2);
    const answer = answerPassage(bodyHtml);
    const mins = readingMinutes(bodyHtml);

    /* Previous and next by publication order. Sequential links let a crawler
       walk the whole archive from any single post, which is how a new blog gets
       its deeper pages discovered at all. */
    const idx = all.findIndex((p: any) => p.slug === post.slug);
    const prev = idx >= 0 && idx + 1 < all.length ? all[idx + 1] : null;
    const next = idx > 0 ? all[idx - 1] : null;

    // Article + BreadcrumbList + Organization + WebSite, and FAQPage when the
    // post contains real Q&A — FAQPage is what earns expandable rich results.
    const jsonLd = articleJsonLd(post as any, bodyHtml);

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
<meta property="og:locale" content="en_GB">
<!-- A 512x512 APP ICON IN A summary_large_image CARD. Every blog share on X
     rendered as a grey box, and as a letterboxed thumbnail everywhere else,
     because the declared card wants a 1200x630 landscape image and was handed a
     square. This is the one that made the blog unshareable. -->
<meta property="og:image" content="${SITE}/assets/og-cover.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="JOSHRIX Studio — Create Worlds. Build Games. Own the Future.">
<meta property="article:published_time" content="${published}">
<meta property="article:modified_time" content="${modified}">
<meta property="article:publisher" content="${SITE}">
<meta name="author" content="The JOSHRIX Editorial Desk">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(post.description)}">
<meta name="twitter:image" content="${SITE}/assets/og-cover.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#07080B">
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
  .post .meta{color:var(--text-3);font-size:.85rem;letter-spacing:.05em;text-transform:uppercase}
  .post article{margin-top:1.6rem}
  .post article p,.post article li{color:var(--text-2);line-height:1.8;font-size:1.02rem;margin:.8rem 0}
  .post article h2{font-size:1.35rem;margin:2rem 0 .6rem}
  .post article h3{font-size:1.08rem;margin:1.4rem 0 .4rem}
  .post article a{color:#D92D3F}
  .post article ul{padding-left:1.3rem}
  .crumbs{font-size:.8125rem;color:var(--text-3);margin:.2rem 0 1rem}
  .crumbs a{color:var(--text-3);text-decoration:none}
  .crumbs a:hover{color:var(--text)}
  .post .meta .byline{color:var(--text-2)}
  /* The answer block. Marked up so the speakable selector can point at it, and
     set apart visually because a reader scanning for the answer wants it
     findable too. This CSS lives inside a template literal — no backticks. */
  .jx-answer{border-left:3px solid var(--signal);background:var(--ink-raised);
    border-radius:0 var(--r-sm) var(--r-sm) 0;padding:1rem 1.15rem;margin:1.5rem 0}
  .jx-answer p{margin:0;color:var(--text);font-size:1.05rem;line-height:1.65}
  .toc{border:1px solid var(--line);border-radius:var(--r);padding:1rem 1.2rem;margin:1.5rem 0;
    background:var(--ink-raised)}
  .toc h2{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin:0 0 .5rem}
  .toc ol{margin:0;padding-left:1.2rem}
  .toc li{margin:.3rem 0}
  .toc a{color:var(--text-2);text-decoration:none;font-size:.9375rem}
  .toc a:hover{color:var(--signal)}
  .post article h2{scroll-margin-top:80px}
  .post article h3{scroll-margin-top:80px}
  .seq{display:flex;justify-content:space-between;gap:1rem;margin-top:2.4rem;
    border-top:1px solid var(--line);padding-top:1.2rem;font-size:.9375rem}
  .seq a{color:var(--text-2);text-decoration:none;max-width:47%}
  .seq a:hover{color:var(--signal)}
  .seq .n{text-align:right}
  /* Inside <article> on purpose: links in a page's boilerplate are discounted,
     links in its body are not, and these are the post-to-post links that make
     an archive a cluster instead of a pile. */
  .related{margin-top:2.2rem;border-top:1px solid var(--line);padding-top:1.2rem}
  .related h2{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin:0 0 .6rem}
  .related ul{margin:0;padding-left:1.2rem}
  .related li{margin:.35rem 0}
  .related a{color:var(--text-2);text-decoration:none}
  .related a:hover{color:var(--signal)}
  .more{border-top:1px solid var(--line);margin-top:2.6rem;padding-top:1.4rem}
  .more a{display:block;color:#D92D3F;text-decoration:none;margin:.45rem 0}
</style>
</head>
<body>
<div class="noise" aria-hidden="true"></div>
<nav class="jx">
  <a class="brand" href="/">
    <svg viewBox="-50 -50 100 100"><defs><linearGradient id="jxG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E8455A"/><stop offset="100%" stop-color="#8E1C2A"/></linearGradient></defs><polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="none" stroke="url(#jxG)" stroke-width="7" stroke-linejoin="round"/><polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="url(#jxG)"/></svg>
    <span class="word">JOSHRIX<em>STUDIO</em></span>
  </a>
  <ul class="nav-links">
    <li><a href="/blog">Blog</a></li>
    <li><a href="/arcade">Arcade</a></li>
    <li><a href="/pricing">Pricing</a></li>
  </ul>
  <div class="nav-right"><a class="btn btn-primary btn-sm" href="/studio">Launch Studio</a></div>
</nav>
<main class="jx post">
  <!-- A VISIBLE breadcrumb, not only the JSON-LD one. Google cross-checks the
       markup against what is on the page before it renders a breadcrumb in the
       result, and an answer engine uses it to place the page in a hierarchy. -->
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a> <span aria-hidden="true">/</span>
    <a href="/blog">Blog</a> <span aria-hidden="true">/</span>
    <span aria-current="page">${esc(String(post.title).slice(0, 60))}</span>
  </nav>
  <h1>${esc(post.title)}</h1>
  <p class="meta"><span class="byline">The JOSHRIX Editorial Desk</span> · <time datetime="${published}">${new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time>${modified !== published ? ` · updated <time datetime="${modified}">${new Date(modified).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time>` : ""} · ${mins} min read${views > 0 ? ` · ${views.toLocaleString("en-GB")} ${views === 1 ? "view" : "views"}` : ""}</p>
  ${answer ? `<div class="jx-answer"><p>${esc(answer)}</p></div>` : ""}
  ${toc.length >= 3 ? `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ol>${toc.map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}</ol></nav>` : ""}
  <article>${bodyHtml}${related.length ? `<aside class="related"><h2>Related reading</h2><ul>${related.map((p: any) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul></aside>` : ""}</article>
  ${prev || next ? `<nav class="seq" aria-label="More articles">${prev ? `<a class="p" href="/blog/${esc(prev.slug)}" rel="prev">&larr; ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="n" href="/blog/${esc(next.slug)}" rel="next">${esc(next.title)} &rarr;</a>` : "<span></span>"}</nav>` : ""}
  ${others.length ? `<div class="more"><h2 style="font-size:1.1rem">Keep reading</h2>${others.slice(0, 6).map((p: any) => `<a href="/blog/${esc(p.slug)}">${esc(p.title)}</a>`).join("")}<p style="margin-top:1rem"><a href="/blog">All articles</a> · <a href="/studio">Create your own game</a> · <a href="/arcade">Play free games</a></p></div>` : `<div class="more"><p><a href="/blog">All articles</a> · <a href="/studio">Create your own game</a></p></div>`}
</main>
<div class="foot-base" style="justify-content:center;gap:1.4rem;display:flex;flex-wrap:wrap;padding:1.5rem">
  <span>© 2026 JOSHRIX Studio</span>
  <a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a>
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
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Post not found — JOSHRIX</title><meta name="robots" content="noindex"></head><body style="background:#07080B;color:#ececf4;font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center"><p>Post not found — <a style="color:#D92D3F" href="/blog">back to the blog</a></p></body></html>`;
  res.statusCode = 404;
  return res.send ? res.send(body) : res.end(body);
}

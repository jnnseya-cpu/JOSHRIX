/**
 * GET /sitemap.xml (rewritten here) — dynamic sitemap: static pages + every
 * published blog post + every approved game's play URL. Search engines pick up
 * new content automatically; this is the "dynamic links" backbone.
 */
import { getDb, ensureBlogSchema, ensureGameSchema, listBlogPosts, listApprovedGames } from "./_ledger";

const SITE = "https://www.joshrix.com";
const STATIC_PAGES = [
  /* EXTENSIONLESS, to match every page's own <link rel="canonical">.
     vercel.json sets cleanUrls, so "/pricing.html" 308-redirects to "/pricing".
     Listing the .html spelling meant every marketing URL in this sitemap was a
     redirect to the URL we actually wanted indexed — crawl budget spent to
     arrive where it could have started, on a domain that has none to spare. */
  "", "arcade", "blog", "marketplace", "pricing", "how-it-works",
  "docs", "showcase", "worlds", "agent-fleet", "enterprise",
  "about", "press", "contact", "careers", "referrals",
  "ip-registry", "terms", "privacy", "refunds",
  "features",
  /* Public and indexable, and absent from this list until 6 Sep. /growth even
     carried its own canonical, so it was meant to be indexed and was simply
     never listed; /signup is the conversion page; /studio is the product.
     Account pages (wallet, dashboard, profile, login) are deliberately NOT here
     and now carry noindex — a logged-out crawler sees an empty shell. */
  "growth", "signup", "studio",
  /* "N CC0 models included" is a claim on every marketing page (the count
     itself lives in _features.ts, once); /library is
     the page that lets a stranger check it in ten seconds instead of taking it
     on trust, and "free 3D game assets" is a search anyone building a game runs. */
  "library",
  /* The reference games are the strongest organic entry point on the site — a
     stranger can play one without an account — so every one of them belongs
     here. WonderVerse was missing entirely: it shipped, it is linked from the
     newsletter, and search engines were never told it exists. */
  "games/dino-island",
  "games/wonderverse",
  "games/midnight-post",
];

export default async function handler(_req: any, res: any) {
  const urls: Array<{ loc: string; lastmod?: string; priority: string }> = STATIC_PAGES.map((p) => ({
    loc: `${SITE}/${p}`, priority: p === "" ? "1.0" : "0.7",
  }));

  const sql = getDb();
  if (sql) {
    try {
      await ensureBlogSchema(sql);
      await ensureGameSchema(sql);
      for (const p of await listBlogPosts(sql, 500)) {
        urls.push({ loc: `${SITE}/blog/${p.slug}`, lastmod: new Date(p.created_at).toISOString().slice(0, 10), priority: "0.8" });
      }
      for (const g of await listApprovedGames(sql, 500)) {
        urls.push({ loc: `${SITE}/play/${g.id}`, lastmod: new Date(g.created_at).toISOString().slice(0, 10), priority: "0.6" });
      }
    } catch { /* static pages still serve */ }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
  return res.status(200).send ? res.status(200).send(xml) : (res.status(200), res.end(xml));
}

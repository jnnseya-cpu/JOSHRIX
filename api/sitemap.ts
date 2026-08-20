/**
 * GET /sitemap.xml (rewritten here) — dynamic sitemap: static pages + every
 * published blog post + every approved game's play URL. Search engines pick up
 * new content automatically; this is the "dynamic links" backbone.
 */
import { getDb, ensureBlogSchema, ensureGameSchema, listBlogPosts, listApprovedGames } from "./_ledger";

const SITE = "https://www.joshrix.com";
const STATIC_PAGES = [
  "", "arcade.html", "blog.html", "marketplace.html", "pricing.html", "how-it-works.html",
  "docs.html", "showcase.html", "worlds.html", "agent-fleet.html", "enterprise.html",
  "about.html", "press.html", "contact.html", "careers.html", "referrals.html",
  "ip-registry.html", "terms.html", "privacy.html", "refunds.html",
  "features",
  /* The reference games are the strongest organic entry point on the site — a
     stranger can play one without an account — so every one of them belongs
     here. WonderVerse was missing entirely: it shipped, it is linked from the
     newsletter, and search engines were never told it exists.
     Extensionless because cleanUrls is on and the games' own <link rel=canonical>
     points at the extensionless form; listing both spellings would compete. */
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

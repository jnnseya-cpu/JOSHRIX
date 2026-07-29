/**
 * GET /feed.xml (rewritten here) — RSS feed of the blog. Beyond readers, this
 * is the social-media autopilot hook: point Buffer/Zapier/IFTTT/dlvr.it at
 * this feed and every new post auto-shares to X, Facebook, LinkedIn, etc.
 */
import { getDb, ensureBlogSchema, listBlogPosts } from "./_ledger";

const SITE = "https://www.joshrix.com";
const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

export default async function handler(_req: any, res: any) {
  let items = "";
  const sql = getDb();
  if (sql) {
    try {
      await ensureBlogSchema(sql);
      items = (await listBlogPosts(sql, 20)).map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <description>${esc(p.description)}</description>
    <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
  </item>`).join("\n");
    } catch { /* empty feed still valid */ }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>JOSHRIX Blog</title>
  <link>${SITE}/blog.html</link>
  <description>Create Worlds. Build Games. Own the Future. — AI game creation, creator economics, and platform news from JOSHRIX Studio.</description>
  <language>en-gb</language>
${items}
</channel></rss>`;
  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
  return res.status(200).send ? res.status(200).send(xml) : (res.status(200), res.end(xml));
}

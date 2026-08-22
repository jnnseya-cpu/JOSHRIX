/**
 * GET /api/seo-health — what the SEO autopilot has actually achieved.
 *
 * Not a vanity dashboard: it measures the things that decide whether pages
 * rank — indexable inventory, internal link density, orphan pages, thin
 * content, duplicate titles — and reports them plainly, including when they
 * are bad. Public-safe (no content, no PII, aggregates only).
 */
import { getDb, ensureBlogSchema, ensureGameSchema, listBlogPosts, getBlogPost, listApprovedGames } from "./_ledger";
import { autoLink, extractFaq, readingMinutes, SITE } from "./_seo";

export default async function handler(_req: any, res: any) {
  const sql = getDb();
  if (!sql) return res.status(200).json({ mode: "no_db", note: "No database configured — no blog inventory to measure." });

  try {
    await ensureBlogSchema(sql);
    await ensureGameSchema(sql);
    const index = await listBlogPosts(sql, 500);
    const games = await listApprovedGames(sql, 500);

    // measure the real article bodies, not the index rows
    const posts: any[] = [];
    for (const p of index.slice(0, 60)) {
      const full = await getBlogPost(sql, p.slug);
      if (full) posts.push(full);
    }

    const linkRe = /<a\s[^>]*href="([^"]+)"/gi;
    const inbound = new Map<string, number>();
    let totalInternal = 0, totalExternal = 0, thin = 0, noFaq = 0, words = 0;
    const titles = new Map<string, number>();

    for (const p of posts) {
      const body = autoLink(String(p.html ?? ""));      // measure what a visitor SEES
      const w = String(body).replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
      words += w;
      if (w < 700) thin++;
      if (extractFaq(body).length < 2) noFaq++;
      titles.set(String(p.title).toLowerCase(), (titles.get(String(p.title).toLowerCase()) ?? 0) + 1);
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(body))) {
        const href = m[1];
        if (href.startsWith("/") || href.startsWith(SITE)) {
          totalInternal++;
          const path = href.replace(SITE, "").split("#")[0].split("?")[0];
          inbound.set(path, (inbound.get(path) ?? 0) + 1);
        } else if (/^https?:/i.test(href)) totalExternal++;
      }
    }

    const orphans = posts.filter((p) => !inbound.has(`/blog/${p.slug}`)).map((p) => p.slug);
    const dupTitles = [...titles.entries()].filter(([, n]) => n > 1).map(([t]) => t);
    const topLinked = [...inbound.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, inboundLinks: n }));

    const indexable = posts.length + games.length + 12;   // + static pages in the sitemap
    const avgInternal = posts.length ? +(totalInternal / posts.length).toFixed(1) : 0;

    return res.status(200).json({
      inventory: {
        articles: index.length,
        articlesMeasured: posts.length,
        publishedGames: games.length,
        indexableUrls: indexable,
        sitemap: `${SITE}/sitemap.xml`,
        feed: `${SITE}/feed.xml`,
      },
      internalLinking: {
        totalInternalLinks: totalInternal,
        averagePerArticle: avgInternal,
        externalLinks: totalExternal,
        mostLinkedPages: topLinked,
        orphanArticles: orphans.length,
        orphanSlugs: orphans.slice(0, 10),
      },
      contentQuality: {
        averageWords: posts.length ? Math.round(words / posts.length) : 0,
        thinArticlesUnder700Words: thin,
        articlesWithoutFaqSchema: noFaq,
        duplicateTitles: dupTitles.length,
      },
      verdict: buildVerdict({ posts: posts.length, avgInternal, orphans: orphans.length, thin, dupTitles: dupTitles.length }),
    });
  } catch (err: any) {
    return res.status(502).json({ error: "SEO health check failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}

/** Plain-language state of play — says "weak" when it is weak. */
function buildVerdict(m: { posts: number; avgInternal: number; orphans: number; thin: number; dupTitles: number }) {
  const issues: string[] = [];
  if (m.posts < 10) issues.push(`only ${m.posts} articles — topical authority needs 20+; the daily autopilot gets there in about three weeks`);
  if (m.avgInternal < 4) issues.push(`internal links average ${m.avgInternal} per article — aim for 5+`);
  if (m.orphans > 0) issues.push(`${m.orphans} article(s) have no inbound internal links (orphans rank poorly)`);
  if (m.thin > 0) issues.push(`${m.thin} article(s) under 700 words`);
  if (m.dupTitles > 0) issues.push(`${m.dupTitles} duplicate title(s) — these compete with each other`);
  return {
    healthy: issues.length === 0,
    issues,
    note: issues.length === 0
      ? "Internal linking, depth and uniqueness all clear the bar. Ranking now depends on external links and time."
      : "Fixable by the autopilot continuing to publish — external backlinks still require real outreach, which no code can generate.",
  };
}

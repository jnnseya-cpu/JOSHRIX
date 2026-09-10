/**
 * An objective SEO / answer-engine score for a rendered page, out of 100.
 *
 * WHY A SCORER AND NOT A CHECKLIST. "SEO optimised" is the kind of claim that
 * is always asserted and never measured, which is how a blog ends up with a
 * 512x512 app icon as its og:image and every share on X rendering as a grey
 * box. A number that a test can fail on is the only version of that claim worth
 * making, and it turns "make it rank" into work with a definition of done.
 *
 * WHAT IT CANNOT DO. Nothing here predicts a ranking. Position depends on
 * competition, domain authority, links from other sites and time — none of
 * which live in this file. What this measures is the half that IS controllable:
 * every on-page and structured-data signal a crawler or an answer engine reads.
 * A page scoring 95 can still sit on page four of a hard query. A page scoring
 * 40 will not rank for anything, and will not be quoted by an answer engine at
 * all, because there is nothing in it to extract.
 *
 * The weighting reflects what actually moves the needle in 2026: answer
 * extraction and structured data now matter as much as classic on-page, because
 * an AI engine synthesising a reply needs a claim it can lift with a citation,
 * not a keyword density.
 *
 * Used in two places, deliberately:
 *   - api/blog-agent.ts REFUSES TO PUBLISH a post that scores below MIN_SCORE.
 *   - tests/t40 scores every rendered post and fails the suite under the floor.
 */

export type Check = {
  id: string;
  /** What the check is worth. */
  weight: number;
  /** 0..1 — partial credit where the thing is a count rather than a boolean. */
  got: number;
  /** Said in the voice of the fix, not the failure. */
  note: string;
};

export type Score = {
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: Check[];
  failed: Check[];
};

/** A post below this is not published. Chosen because every check under it is
 *  something the writer or the renderer controls completely — there is no
 *  category here that a good article can legitimately fail. */
export const MIN_SCORE = 90;

const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

const attr = (html: string, re: RegExp) => (html.match(re) || [, ""])[1] || "";
const count = (html: string, re: RegExp) => (html.match(re) || []).length;
/** Partial credit that reaches 1 at `full` and never exceeds it. */
const ratio = (n: number, full: number) => Math.max(0, Math.min(1, n / full));

/**
 * Score a COMPLETE rendered HTML document.
 *
 * `primary` is the phrase the page is meant to win. Passing it enables the
 * intent checks; without it those are scored as met, because a page with no
 * target keyword is not failing at a keyword — it simply is not that kind of
 * page, and silently docking it would make the number lie.
 */
export function scorePage(html: string, primary = ""): Score {
  const body = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [, html])[1];
  const words = text(body).split(/\s+/).filter(Boolean);
  const kw = primary.toLowerCase().trim();
  const title = attr(html, /<title>([^<]*)<\/title>/i);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/i);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/i);
  const ogImage = attr(html, /property="og:image" content="([^"]*)"/i);
  const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || []).join(" ");
  const hasType = (t: string) => new RegExp(`"@type"\\s*:\\s*"?${t}`, "i").test(ld);

  /* Links inside the article only. Navigation and the footer link the same
     places on every page and would make an orphan article look connected. */
  const links = body.match(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const hrefs = links.map((a) => attr(a, /href="([^"]*)"/i));
  const anchors = links.map((a) => text(a));
  const internal = hrefs.filter((h) => h.startsWith("/") || h.includes("joshrix.com"));

  const c: Check[] = [];
  const add = (id: string, weight: number, got: number | boolean, note: string) =>
    c.push({ id, weight, got: typeof got === "boolean" ? (got ? 1 : 0) : got, note });

  /* ---------------- TITLE AND META — 15 ---------------------------------- */
  const tLen = title.replace(/\s+—\s+JOSHRIX.*$/, "").length;
  add("title-length", 5, tLen >= 15 && tLen <= 65,
    `title is ${tLen} chars before the brand suffix; aim 15-65 so Google does not truncate it`);
  add("meta-description", 5, desc.length >= 70 && desc.length <= 165,
    `meta description is ${desc.length} chars; aim 70-165`);
  /* NOT an exact-substring match. "ai game cost" almost never appears verbatim
     in a title a human would write, and demanding it is how keyword-stuffed
     titles get produced — which modern ranking systems discount and readers
     skip. What matters is that the page is unmistakably ABOUT the phrase, so
     the check is: the meaningful words of the target appear across the title
     and description, with at least one of them in the title itself. */
  const STOP = new Set(["a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "your", "you", "is", "are", "how", "what", "can", "do", "does", "it"]);
  const kwWords = kw.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const inTitle = title.toLowerCase();
  const inBoth = `${inTitle} ${desc.toLowerCase()}`;
  const covered = kwWords.filter((w) => inBoth.includes(w)).length;
  add("keyword-in-title", 5,
    !kwWords.length || (kwWords.some((w) => inTitle.includes(w)) && covered / kwWords.length >= 0.6),
    `the target "${primary}" is only ${kwWords.length ? Math.round((covered / kwWords.length) * 100) : 100}% covered by the title and description together`);

  /* ---------------- CONTENT DEPTH — 25 ----------------------------------- */
  add("word-count", 6, ratio(words.length, 900),
    `${words.length} words in the article body; 900+ is where a page stops being a stub`);
  add("single-h1", 4, count(html, /<h1[\s>]/gi) === 1,
    `exactly one <h1> — found ${count(html, /<h1[\s>]/gi)}`);
  const h2 = count(body, /<h2[\s>]/gi);
  add("section-headings", 4, ratio(h2, 4),
    `${h2} <h2> sections; 4+ gives an answer engine somewhere to enter the page`);
  add("heading-order", 3, !/<h3[\s>][\s\S]*?<h2[\s>]/i.test(body) || h2 > 0,
    "an <h3> before any <h2> breaks the outline a crawler builds");
  /* THE ANSWER BLOCK. An engine composing a reply lifts a self-contained
     sentence that answers the query. Buried behind three paragraphs of throat
     clearing, there is nothing to lift. */
  const opening = text(body).split(/\s+/).slice(0, 50).join(" ");
  add("answer-first", 4, opening.length > 120 && /\b(is|are|means|works|costs|takes|you)\b/i.test(opening),
    "the first ~40 words must answer the title directly — that is the passage an AI engine quotes");
  add("faq-section", 4, /<h2[^>]*>\s*(FAQ|Frequently|Common questions)/i.test(body) || hasType("FAQPage"),
    "a real Q&A section earns expandable results and is the easiest thing for an engine to cite");

  /* ---------------- LINKING — 20 ----------------------------------------- */
  add("internal-links", 6, ratio(internal.length, 8),
    `${internal.length} internal links in the body; 8+ is what makes a topic cluster rather than an orphan`);
  const vague = anchors.filter((a) => /^(click here|here|this|read more|link|learn more)$/i.test(a.trim()));
  add("descriptive-anchors", 5, vague.length === 0,
    `${vague.length} anchor(s) say nothing — anchor text is a ranking signal for the page it points at`);
  /* cleanUrls 308-redirects the .html spelling. An internal link to a redirect
     spends a hop and dilutes what it passes. */
  const redirecting = hrefs.filter((h) => /\.html(\?|#|$)/.test(h));
  add("no-redirect-links", 5, redirecting.length === 0,
    `${redirecting.length} link(s) point at the .html spelling, which redirects — link the canonical directly`);
  const distinct = new Set(internal.map((h) => h.replace(/[#?].*$/, ""))).size;
  add("link-variety", 4, ratio(distinct, 6),
    `${distinct} distinct destinations; repeating one link is not interlinking`);

  /* ---------------- STRUCTURED DATA — 20 --------------------------------- */
  add("schema-article", 5, hasType("BlogPosting") || hasType("Article"), "Article/BlogPosting JSON-LD");
  add("schema-breadcrumb", 3, hasType("BreadcrumbList"), "BreadcrumbList — earns the path shown under the result");
  add("schema-faq", 4, hasType("FAQPage"), "FAQPage — the schema most likely to produce a rich result");
  add("schema-org", 3, hasType("Organization") && hasType("WebSite"), "Organization + WebSite establish the entity");
  add("schema-dates-author", 5,
    /"datePublished"/.test(ld) && /"dateModified"/.test(ld) && /"author"/.test(ld),
    "datePublished, dateModified and author — freshness and E-E-A-T are read from here");

  /* ---------------- SHARING — 10 ----------------------------------------- */
  add("og-core", 3,
    /property="og:title"/.test(html) && /property="og:description"/.test(html) &&
    /property="og:url"/.test(html) && /property="og:type"/.test(html),
    "og:title, og:description, og:url and og:type");
  /* A square icon in a summary_large_image card renders as a grey box on X and
     a letterboxed thumbnail everywhere else. */
  add("og-image", 4,
    ogImage.startsWith("http") &&
    /property="og:image:width" content="1200"/.test(html) &&
    /property="og:image:height" content="630"/.test(html),
    "og:image must be absolute and declared 1200x630");
  add("twitter-card", 3, /name="twitter:card" content="summary_large_image"/.test(html),
    "twitter:card summary_large_image");

  /* ---------------- TECHNICAL AND ANSWER-ENGINE — 10 --------------------- */
  add("canonical", 3, canonical.startsWith("http") && !canonical.endsWith(".html"),
    "one canonical, absolute, and not the spelling that redirects");
  add("head-basics", 2,
    /<html[^>]*\slang="/i.test(html) && /charset=/i.test(html) && /name="viewport"/i.test(html),
    "lang, charset and viewport");
  const imgs = body.match(/<img\s[^>]*>/gi) || [];
  add("image-alt", 2, imgs.length === 0 || imgs.every((i) => /\salt="/i.test(i)),
    `${imgs.filter((i) => !/\salt="/i.test(i)).length} image(s) without alt text`);
  add("speakable", 3, hasType("SpeakableSpecification") || /"speakable"/i.test(ld),
    "speakable marks the passage a voice or AI answer should read out");

  const total = Math.round(c.reduce((s, x) => s + x.weight * x.got, 0));
  const grade = total >= 90 ? "A" : total >= 80 ? "B" : total >= 70 ? "C" : total >= 60 ? "D" : "F";
  return { total, grade, checks: c, failed: c.filter((x) => x.got < 1) };
}

/** One line per shortfall, worst first — what to fix, in order. */
export function scoreReport(s: Score): string {
  const lines = [`SEO score ${s.total}/100 (${s.grade})`];
  for (const f of [...s.failed].sort((a, b) => b.weight * (1 - b.got) - a.weight * (1 - a.got))) {
    lines.push(`  -${(f.weight * (1 - f.got)).toFixed(1)}  ${f.id}: ${f.note}`);
  }
  return lines.join("\n");
}

/**
 * Score a DRAFT — what the writer produced, before the renderer adds its half.
 *
 * The full-page scorer above judges schema, cards and canonicals. Those are
 * fixed properties of every post: the renderer emits them identically whatever
 * the article says, and tests/t40 covers them once rather than blaming a writer
 * for them. Judging a draft on them would hand every draft the same free 40
 * points and make the floor meaningless.
 *
 * So this runs the writer-controlled checks only and renormalises to 100, which
 * makes the number mean "how good is this article" rather than "how good is this
 * template". A draft cannot buy its way over the line with markup it did not
 * write.
 */
export function scoreArticleDraft(a: {
  title?: string; metaDescription?: string; html?: string; keywords?: string[] | string;
}): Score {
  const kws = Array.isArray(a.keywords) ? a.keywords : String(a.keywords ?? "").split(/,\s*/);
  const primary = (kws[0] || "").toLowerCase();
  /* Wrapped in the same shape the page scorer reads, so BOTH numbers come from
     one implementation. Two scorers that could disagree is how a draft passes
     the gate and the published page fails the suite. */
  const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${a.title ?? ""}</title>
<meta name="description" content="${String(a.metaDescription ?? "").replace(/"/g, "&quot;")}">
</head><body><h1>${a.title ?? ""}</h1><article>${a.html ?? ""}</article></body></html>`;

  const WRITER_OWNS = new Set([
    "title-length", "meta-description", "keyword-in-title",
    "word-count", "single-h1", "section-headings", "heading-order", "answer-first", "faq-section",
    "internal-links", "descriptive-anchors", "no-redirect-links", "link-variety",
    "image-alt",
  ]);
  const all = scorePage(page, primary);
  const checks = all.checks.filter((c) => WRITER_OWNS.has(c.id));
  const max = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.weight * c.got, 0);
  const total = max ? Math.round((earned / max) * 100) : 0;
  const grade: Score["grade"] = total >= 90 ? "A" : total >= 80 ? "B" : total >= 70 ? "C" : total >= 60 ? "D" : "F";
  return { total, grade, checks, failed: checks.filter((c) => c.got < 1) };
}

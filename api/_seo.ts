/**
 * SEO engine — the parts that must NOT depend on the model cooperating.
 *
 * The Content Agent is asked to weave internal links into each article, but a
 * language model is not a reliable link-builder: it forgets, invents URLs, or
 * links the same page five times. Everything here runs server-side on the
 * stored article, so every post gets correct, contextual internal links and
 * valid structured data whether the model bothered or not.
 */

export const SITE = "https://www.joshrix.com";

/** Escape for HTML attribute/text contexts. */
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

/** Escape a string for safe use inside a RegExp. */
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Anchor targets for automatic in-body linking, most specific phrase first so
 * "JOSHRIX Studio" wins over "studio". Only pages that genuinely exist.
 */
import { featureLinkTargets } from "./_features";

/** The hub is the pillar of the feature cluster, so it earns a link target of
 *  its own — every article that mentions what the platform does can point at it. */
/**
 * Phrases the auto-linker turns into internal links.
 *
 * EXTENSIONLESS, all of them. cleanUrls 308-redirects "/studio.html" to
 * "/studio", so every one of these used to spend a redirect hop and hand the
 * destination a diluted signal — on a site whose whole internal-linking
 * strategy runs through this table.
 *
 * Ordered longest-phrase-first at use time, so "AI game generator" is not
 * consumed by a shorter overlapping rule before it can match.
 */
export const LINK_TARGETS: Array<{ phrase: RegExp; href: string; title: string }> = [
  { phrase: /\bwhat JOSHRIX does\b/i, href: "/features", title: "what JOSHRIX does" },
  { phrase: /\bplatform features\b/i, href: "/features", title: "platform features" },
  { phrase: /\bJOSHRIX Studio\b/i, href: "/studio", title: "JOSHRIX Studio" },
  { phrase: /\bthe Studio\b/i, href: "/studio", title: "the Studio" },
  { phrase: /\bJOSHRIX Arcade\b/i, href: "/arcade", title: "JOSHRIX Arcade" },
  { phrase: /\bthe Arcade\b/i, href: "/arcade", title: "the Arcade" },
  { phrase: /\bmarketplace\b/i, href: "/marketplace", title: "marketplace" },
  { phrase: /\bpricing\b/i, href: "/pricing", title: "pricing" },
  { phrase: /\bhow it works\b/i, href: "/how-it-works", title: "how it works" },
  { phrase: /\bIP registry\b/i, href: "/ip-registry", title: "IP registry" },
  { phrase: /\bagent fleet\b/i, href: "/agent-fleet", title: "agent fleet" },
  { phrase: /\brefund polic(?:y|ies)\b/i, href: "/refunds", title: "refund policy" },
  /* Added for reach: each of these is a phrase an article about AI game
     creation uses naturally, pointing at the page that answers it. More
     destinations means a denser cluster, and density is what separates a blog
     that ranks from a pile of orphan posts. */
  { phrase: /\bmodel library\b/i, href: "/library", title: "model library" },
  { phrase: /\b(?:CC0|game-ready) (?:3D )?models\b/i, href: "/library", title: "the included model library" },
  { phrase: /\bgrowth (?:engine|tools)\b/i, href: "/growth", title: "the growth engine" },
  { phrase: /\bmarketing tools\b/i, href: "/growth", title: "marketing tools" },
  { phrase: /\bcreator (?:earnings|payouts)\b/i, href: "/wallet", title: "creator earnings" },
  { phrase: /\bplay(?:able)? free\b/i, href: "/worlds", title: "games you can play free" },
  { phrase: /\bfeatured (?:worlds|games)\b/i, href: "/worlds", title: "featured worlds" },
  { phrase: /\bhuman (?:review|moderation)\b/i, href: "/how-it-works", title: "human moderation" },
  /* Written to match how an article actually phrases the thing, not the label
     the product uses for it. "commission rates" almost never appears; the
     sentence says "commission starts at 25%". A target that only matches the
     internal name places no links, which is how a page ends up with three. */
  { phrase: /\bcommission\b/i, href: "/pricing", title: "commission" },
  { phrase: /\bmetered compute\b/i, href: "/pricing", title: "metered compute" },
  { phrase: /\bbrowser (?:tab|game)\b/i, href: "/arcade", title: "browser games" },
  { phrase: /\bshare link\b/i, href: "/arcade", title: "share link" },
  { phrase: /\bpublish(?:ing|ed)?\b/i, href: "/how-it-works", title: "publishing" },
  { phrase: /\benhance pass(?:es)?\b/i, href: "/studio", title: "enhance passes" },
  { phrase: /\bthree (?:independent )?providers\b/i, href: "/agent-fleet", title: "three providers" },
  { phrase: /\bsprites?\b/i, href: "/library", title: "sprites" },
  { phrase: /\brem(?:ix|ixing)\b/i, href: "/ip-registry", title: "remixing" },
  { phrase: /\bown(?:s|ership)?\b(?= (?:the|your|of|outright))/i, href: "/ip-registry", title: "ownership" },
  { phrase: /\bsell (?:your|a) game\b/i, href: "/marketplace", title: "sell your game" },
  { phrase: /\bwithdraw(?:al|als)?\b/i, href: "/wallet", title: "withdrawals" },
  { phrase: /\bACUs?\b/, href: "/pricing", title: "ACUs" },
  { phrase: /\benterprise\b/i, href: "/enterprise", title: "enterprise" },
  { phrase: /\bpartner programme\b/i, href: "/referrals", title: "partner programme" },
  { phrase: /\bdocumentation\b/i, href: "/docs", title: "documentation" },
  { phrase: /\bcreate (?:a|your) (?:own )?game\b/i, href: "/studio", title: "create your own game" },
];

/**
 * Inject internal links into article HTML, at most once per destination, and
 * NEVER inside an existing <a>, heading, or code block — double-linking and
 * nested anchors are both SEO defects and rendering bugs.
 */
export function autoLink(html: string, extra: Array<{ phrase: RegExp; href: string; title: string }> = [], maxLinks = 18): string {
  /* SIBLING POSTS ALWAYS WIN, then platform targets longest-phrase-first.
     Sorting the merged list by length looked equivalent and was not: a broad
     rule like /\brem(?:ix|ixing)\b/ has a LONGER source than the sibling phrase
     "Remix Economy", so it consumed the sentence and the post-to-post link was
     never placed. Post-to-post links are the ones that build topical authority,
     so they are not allowed to lose a tie-break to a generic rule. Within each
     group, longer phrases go first so a specific rule is not eaten by a broad
     one that happens to overlap it. */
  const byLength = (a: { phrase: RegExp }, b: { phrase: RegExp }) => b.phrase.source.length - a.phrase.source.length;
  const targets = [...[...extra].sort(byLength), ...[...LINK_TARGETS].sort(byLength)];
  // split on tags we must not touch: existing anchors, headings, code, pre
  const protectedBlock = /(<a\b[\s\S]*?<\/a>|<h[1-6]\b[\s\S]*?<\/h[1-6]>|<code\b[\s\S]*?<\/code>|<pre\b[\s\S]*?<\/pre>|<[^>]+>)/gi;

  /* Each entry is a run of the document plus whether it may still be linked
     into. Freezing an anchor the MOMENT it is inserted is the whole point:
     the previous version split the document once, up front, then replaced
     inside those segments — so a link placed early was ordinary text to every
     later target, and a broad rule could match inside the href of a link the
     linker had just written, producing
         <a href="/blog/<a href="/ip-registry">remix</a>-economy">
     which is a nested anchor inside an attribute: invalid markup, a broken URL,
     and an SEO defect all at once. It only appeared once the target list was
     broad enough for two rules to overlap on one sentence. */
  type Run = { text: string; linkable: boolean };
  let runs: Run[] = html.split(protectedBlock).map((text, i) => ({ text, linkable: i % 2 === 0 }));
  const used = new Set<string>();
  let placed = 0;

  for (const t of targets) {
    if (placed >= maxLinks) break;
    if (used.has(t.href)) continue;

    const next: Run[] = [];
    let done = false;
    for (const run of runs) {
      if (done || !run.linkable) { next.push(run); continue; }
      const m = run.text.match(t.phrase);
      if (!m || m.index === undefined) { next.push(run); continue; }
      const before = run.text.slice(0, m.index);
      const after = run.text.slice(m.index + m[0].length);
      next.push({ text: before, linkable: true });
      next.push({ text: `<a href="${t.href}">${m[0]}</a>`, linkable: false });
      next.push({ text: after, linkable: true });
      done = true;
    }
    if (done) { runs = next; used.add(t.href); placed++; }
  }
  return runs.map((r) => r.text).join("");
}

/** Pull the FAQ pairs a post already contains so they can be marked up for rich results. */
export function extractFaq(html: string): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 10) {
    const q = strip(m[1]).trim();
    const a = strip(m[2]).trim();
    if (q.length > 8 && a.length > 20 && /\?$/.test(q)) out.push({ q, a });
  }
  return out;
}

const strip = (s: string) => String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** Approximate reading time — Google shows it, readers like it, costs nothing. */
export function readingMinutes(html: string): number {
  const words = strip(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

/**
 * Full structured-data graph for an article page: Article + BreadcrumbList +
 * (when the post has real Q&A) FAQPage, which is what earns expandable rich
 * results in search. One @graph so crawlers read it as one connected entity.
 */
export function articleJsonLd(
  post: { title: string; description: string; slug: string; created_at: any; updated_at?: any; keywords?: string | null },
  bodyHtml: string,
): string {
  const url = `${SITE}/blog/${post.slug}`;
  const published = new Date(post.created_at).toISOString();
  /* dateModified is a live freshness signal and must not simply echo
     datePublished — an engine reading the same value for both learns nothing.
     It falls back to published only when the row genuinely has no edit. */
  const modified = new Date(post.updated_at ?? post.created_at).toISOString();
  const faq = extractFaq(bodyHtml);
  const graph: any[] = [
    {
      /* BlogPosting rather than Article: it is a strict subtype, so everything
         that accepts Article accepts this, and it tells an engine what KIND of
         page this is without it having to infer from the URL. */
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: String(post.title).slice(0, 110),
      description: post.description,
      datePublished: published,
      dateModified: modified,
      wordCount: strip(bodyHtml).split(/\s+/).filter(Boolean).length,
      ...(post.keywords ? { keywords: post.keywords } : {}),
      inLanguage: "en",
      isPartOf: { "@id": `${SITE}/#website` },
      author: { "@id": `${SITE}/#editorial` },
      publisher: { "@id": `${SITE}/#org` },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: {
        "@type": "ImageObject",
        url: `${SITE}/assets/og-cover.png`,
        width: 1200,
        height: 630,
      },
      /* SPEAKABLE. Names the passages a voice assistant reads aloud and, in
         practice, the passages an answer engine lifts first: the headline and
         the opening answer. Without it the engine picks for itself. */
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: [".post h1", ".jx-answer"],
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: String(post.title).slice(0, 80) },
      ],
    },
    orgNode(),
    editorialNode(),
    websiteNode(),
  ];
  if (faq.length >= 2) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

/** The named author behind every article.
 *
 *  It used to be the Organization node itself. Search and answer engines both
 *  weigh authorship when deciding whether to trust and cite a page, and an
 *  article authored by a company is a weaker signal than one authored by a
 *  named editorial entity that belongs to it. This is honest — the posts really
 *  are written by the Content Agent under editorial review — and it gives the
 *  byline something to attach to. */
export function editorialNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE}/#editorial`,
    name: "The JOSHRIX Editorial Desk",
    url: `${SITE}/blog`,
    parentOrganization: { "@id": `${SITE}/#org` },
    description:
      "Writes the JOSHRIX blog from the platform's own measured figures — build costs, library counts and commission rates come from the codebase, never from an estimate.",
  };
}

/** The publisher identity every page points at — one canonical entity. */
export function orgNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE}/#org`,
    name: "JOSHRIX Studio",
    url: SITE,
    logo: { "@type": "ImageObject", url: `${SITE}/assets/icons/icon-512.png`, width: 512, height: 512 },
    sameAs: [] as string[],
    description: "AI game creation platform — describe a game in any language and get a real, playable browser game.",
  };
}

/** WebSite node with the sitelinks search box crawlers can surface. */
export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    url: SITE,
    name: "JOSHRIX Studio",
    publisher: { "@id": `${SITE}/#org` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/arcade?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Structured data for a playable game page — VideoGame is a real schema type. */
export function gameJsonLd(g: {
  id: string; title: string; summary?: string | null; created_at?: any; plays?: number;
  /** Pence, when the creator has priced it. null/omitted means free to play. */
  priceMinor?: number | null;
}): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoGame",
        "@id": `${SITE}/play/${g.id}#game`,
        name: g.title,
        description: g.summary || `${g.title} — a browser game created on JOSHRIX Studio.`,
        url: `${SITE}/play/${g.id}`,
        gamePlatform: ["Web browser", "Mobile web"],
        applicationCategory: "Game",
        operatingSystem: "Any",
        publisher: { "@id": `${SITE}/#org` },
        ...(g.created_at ? { datePublished: new Date(g.created_at).toISOString() } : {}),
        /* The offer has to match the paywall. This declared price "0" for every
           game, including priced ones — a structured-data claim contradicted by
           the checkout the buyer then hits, which is exactly the mismatch that
           gets rich results suppressed and, more to the point, is not true. */
        offers: {
          "@type": "Offer",
          price: g.priceMinor != null && g.priceMinor > 0 ? (g.priceMinor / 100).toFixed(2) : "0",
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
          url: `${SITE}/play/${g.id}`,
        },
        ...(typeof g.plays === "number" && g.plays > 0
          ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/PlayAction", userInteractionCount: g.plays } }
          : {}),
      },
      orgNode(),
    ],
  }).replace(/</g, "\\u003c");
}

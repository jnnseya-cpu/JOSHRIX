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
export const LINK_TARGETS: Array<{ phrase: RegExp; href: string; title: string }> = [
  { phrase: /\bJOSHRIX Studio\b/i, href: "/studio.html", title: "JOSHRIX Studio" },
  { phrase: /\bthe Studio\b/i, href: "/studio.html", title: "the Studio" },
  { phrase: /\bJOSHRIX Arcade\b/i, href: "/arcade.html", title: "JOSHRIX Arcade" },
  { phrase: /\bthe Arcade\b/i, href: "/arcade.html", title: "the Arcade" },
  { phrase: /\bmarketplace\b/i, href: "/marketplace.html", title: "marketplace" },
  { phrase: /\bpricing\b/i, href: "/pricing.html", title: "pricing" },
  { phrase: /\bhow it works\b/i, href: "/how-it-works.html", title: "how it works" },
  { phrase: /\bIP registry\b/i, href: "/ip-registry.html", title: "IP registry" },
  { phrase: /\bagent fleet\b/i, href: "/agent-fleet.html", title: "agent fleet" },
  { phrase: /\brefund polic(?:y|ies)\b/i, href: "/refunds.html", title: "refund policy" },
];

/**
 * Inject internal links into article HTML, at most once per destination, and
 * NEVER inside an existing <a>, heading, or code block — double-linking and
 * nested anchors are both SEO defects and rendering bugs.
 */
export function autoLink(html: string, extra: Array<{ phrase: RegExp; href: string; title: string }> = [], maxLinks = 8): string {
  const targets = [...LINK_TARGETS, ...extra];
  // split on tags we must not touch: existing anchors, headings, code, pre
  const protectedBlock = /(<a\b[\s\S]*?<\/a>|<h[1-6]\b[\s\S]*?<\/h[1-6]>|<code\b[\s\S]*?<\/code>|<pre\b[\s\S]*?<\/pre>|<[^>]+>)/gi;
  const used = new Set<string>();
  let placed = 0;

  const parts = html.split(protectedBlock);
  for (let i = 0; i < parts.length; i++) {
    // odd indices are the protected captures — leave them exactly as they are
    if (i % 2 === 1) continue;
    for (const t of targets) {
      if (placed >= maxLinks) break;
      if (used.has(t.href)) continue;
      const m = parts[i].match(t.phrase);
      if (!m) continue;
      const anchor = `<a href="${t.href}">${m[0]}</a>`;
      parts[i] = parts[i].replace(t.phrase, anchor);
      used.add(t.href);
      placed++;
    }
  }
  return parts.join("");
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
export function articleJsonLd(post: { title: string; description: string; slug: string; created_at: any; keywords?: string | null }, bodyHtml: string): string {
  const url = `${SITE}/blog/${post.slug}`;
  const published = new Date(post.created_at).toISOString();
  const faq = extractFaq(bodyHtml);
  const graph: any[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: String(post.title).slice(0, 110),
      description: post.description,
      datePublished: published,
      dateModified: published,
      wordCount: strip(bodyHtml).split(/\s+/).filter(Boolean).length,
      ...(post.keywords ? { keywords: post.keywords } : {}),
      inLanguage: "en",
      isPartOf: { "@id": `${SITE}/#website` },
      author: { "@id": `${SITE}/#org` },
      publisher: { "@id": `${SITE}/#org` },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: `${SITE}/assets/icons/icon-512.png`,
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

/** The publisher identity every page points at — one canonical entity. */
export function orgNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE}/#org`,
    name: "JOSHRIX Studio",
    url: SITE,
    logo: { "@type": "ImageObject", url: `${SITE}/assets/icons/icon-512.png`, width: 512, height: 512 },
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
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/arcade.html?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Structured data for a playable game page — VideoGame is a real schema type. */
export function gameJsonLd(g: { id: string; title: string; summary?: string | null; created_at?: any; plays?: number }): string {
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
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", availability: "https://schema.org/InStock" },
      },
      orgNode(),
    ],
  }).replace(/</g, "\\u003c");
}

#!/usr/bin/env node
/**
 * Give every public page a canonical URL and a share card.
 *
 *   node tools/seo-head.mjs            apply
 *   node tools/seo-head.mjs --check    report only, non-zero if anything is missing
 *
 * WHY. An audit of all 32 pages found that NOT ONE carried an og:image, og:title
 * or og:description, and only two carried a canonical. Two consequences, both
 * paid for daily:
 *
 * 1. SHARING. Every link pasted into WhatsApp, a Discord server, X, LinkedIn or
 *    Slack rendered as bare blue text. The landing page's own argument is that
 *    JOSHRIX wins "the queue, the group chat, the fanbase drop" — the shared
 *    link IS the acquisition strategy, and it was the one surface with no design
 *    on it. The three reference games had full cards; the entire marketing site
 *    had none.
 *
 * 2. DUPLICATION. vercel.json sets cleanUrls, so /pricing and /pricing.html are
 *    both reachable. Without a canonical a crawler must guess which is the real
 *    one, and on a domain with no authority yet every split signal costs.
 *
 * Canonicals are EXTENSIONLESS because that is what cleanUrls serves and what
 * the reference games already declare. api/sitemap.ts is aligned to the same
 * form — a sitemap listing a URL that redirects to the canonical spends crawl
 * budget to arrive where it could have started.
 *
 * play.html is deliberately given NO canonical: /play/:id rewrites to it, so a
 * static canonical would collapse every game in the catalogue onto one URL. It
 * gets a generic card instead — see PER_PAGE.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "frontend");
const SITE = "https://www.joshrix.com";
const IMAGE = `${SITE}/assets/og-cover.png`;
const check = process.argv.includes("--check");

/** Pages whose content is personal or operational. Indexing them spends a small
 *  site's crawl budget on shells a logged-out crawler sees as empty, and puts a
 *  user's own profile surface into search results. */
const NOINDEX = new Set(["admin", "dashboard", "profile", "wallet", "login"]);

/** Templates that serve many URLs from one file. A static canonical on these
 *  would tell a crawler that every game, or every spec, is the same page. */
const NO_CANONICAL = new Set(["play", "doc"]);

/** Pages excluded entirely — not public surfaces. */
const SKIP = new Set([]);

/**
 * Share copy, per page. og:title is NOT the <title>: a tab title reads
 * "Pricing — JOSHRIX Studio" because the tab is one of twenty, while a card in a
 * group chat has no such context and has to say what the thing is.
 * Where a value is null the page's own <title>/description is used.
 */
const PER_PAGE = {
  index: {
    ogTitle: "JOSHRIX Studio — describe a game, own the game",
    ogDesc: "Describe a game in any language. An agent fleet builds it and hands you a link that plays in any browser. 2,591 models included, about £0.32 of compute a game, and you own it outright.",
  },
  studio: {
    ogTitle: "Forge Studio — build a game from a sentence",
    ogDesc: "Describe the game you want. Watch the fleet write it, check it and hand back something playable. No engine, no install, no code.",
  },
  pricing: { ogTitle: "JOSHRIX pricing — pay for the compute you used" },
  arcade: { ogTitle: "The JOSHRIX Arcade — play, no account needed" },
  worlds: { ogTitle: "Games forged on JOSHRIX — play any of them free" },
  library: { ogTitle: "2,591 CC0 game models, included with every account" },
  marketplace: { ogTitle: "JOSHRIX Marketplace — buy and sell browser games" },
  "how-it-works": { ogTitle: "How a JOSHRIX game gets built, in ten stages" },
  "agent-fleet": { ogTitle: "The seven agents that build a JOSHRIX game" },
  growth: { ogTitle: "Ten AI tools to market the game you made" },
  referrals: { ogTitle: "The JOSHRIX Growth Partner Programme" },
  enterprise: { ogTitle: "JOSHRIX for publishers and institutions" },
  "ip-registry": { ogTitle: "You own the game — the JOSHRIX IP Registry" },
  signup: { ogTitle: "Create a JOSHRIX Studio account" },
  blog: { ogTitle: "The JOSHRIX blog — AI game creation and creator economics" },
  play: {
    ogTitle: "Play a game forged on JOSHRIX Studio",
    ogDesc: "A browser game built on JOSHRIX. No download, no account — it plays on a phone or a desktop.",
  },
  play3d: { ogTitle: "The JOSHRIX 3D engine, as a playable tech demo" },
  press: { ogTitle: "JOSHRIX Studio press kit — logo, palette, boilerplate" },
  "embed-demo": { ogTitle: "Embed a JOSHRIX game on any site with one script tag" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const files = fs.readdirSync(WEB).filter((f) => f.endsWith(".html")).sort();
let changed = 0;
const missing = [];

for (const file of files) {
  const slug = file.replace(/\.html$/, "");
  if (SKIP.has(slug)) continue;

  let html = fs.readFileSync(path.join(WEB, file), "utf8");

  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ""])[1].trim();
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1].trim();
  const cfg = PER_PAGE[slug] || {};
  const ogTitle = cfg.ogTitle || title;
  const ogDesc = cfg.ogDesc || desc;
  const url = slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;

  /* Everything this tool owns lives between the markers, so re-running it
     replaces its own block instead of stacking a second copy. */
  const START = "<!-- seo-head:start -->";
  const END = "<!-- seo-head:end -->";
  const block = [
    START,
    ...(NO_CANONICAL.has(slug) ? [] : [`<link rel="canonical" href="${url}">`]),
    ...(NOINDEX.has(slug) ? [`<meta name="robots" content="noindex,follow">`] : []),
    `<meta property="og:site_name" content="JOSHRIX Studio">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="en_GB">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(ogDesc)}">`,
    ...(NO_CANONICAL.has(slug) ? [] : [`<meta property="og:url" content="${url}">`]),
    `<meta property="og:image" content="${IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="JOSHRIX Studio — Create Worlds. Build Games. Own the Future.">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${esc(ogDesc)}">`,
    `<meta name="twitter:image" content="${IMAGE}">`,
    END,
  ].join("\n");

  if (!title || !desc) { missing.push(`${slug}: ${!title ? "no <title>" : "no meta description"}`); continue; }

  let next;
  if (html.includes(START)) {
    next = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  } else {
    /* Anchor to the description meta, which every page has and which sits in the
       head above the embedded fonts. Appending to <head> would bury the card
       below 200KB of base64 on the pages that inline their type. */
    const anchor = html.match(/<meta name="description" content="[^"]*">/);
    if (!anchor) { missing.push(`${slug}: no anchor`); continue; }
    next = html.replace(anchor[0], `${anchor[0]}\n${block}`);
  }

  if (next !== html) {
    if (!check) fs.writeFileSync(path.join(WEB, file), next);
    changed++;
    console.log(`  ${check ? "would update" : "updated"}  ${slug}${NOINDEX.has(slug) ? "  (noindex)" : ""}${NO_CANONICAL.has(slug) ? "  (template — no canonical)" : ""}`);
  }
}

if (missing.length) {
  console.error("\nCOULD NOT PROCESS:");
  for (const m of missing) console.error("  " + m);
}
console.log(`\n${changed} page(s) ${check ? "would change" : "updated"}, ${files.length} scanned`);
if (missing.length) process.exit(1);
if (check && changed) process.exit(1);

#!/usr/bin/env node
/**
 * Publish one blog article per platform feature, against a LIVE deployment.
 *
 *   MODERATION_KEY=... node tools/seed-feature-blog.mjs --dry-run
 *   MODERATION_KEY=... node tools/seed-feature-blog.mjs
 *   MODERATION_KEY=... node tools/seed-feature-blog.mjs --only remix-royalties
 *   MODERATION_KEY=... node tools/seed-feature-blog.mjs --skip-existing
 *
 * WHY THIS EXISTS. The Content Agent already covers every capability: allTopics()
 * interleaves one FEATURE: topic per feature with the editorial calendar, and the
 * daily cron walks it. That is the right shape for a blog that keeps growing, but
 * it means the twenty-first feature gets its article forty days from now, and
 * "sell every feature" is not a forty-day job.
 *
 * So this drives the same endpoint deliberately, one feature at a time, in the
 * order a reader should meet them: what it does, then what it costs, then what
 * happens after you publish. Nothing here writes an article. Every post comes
 * out of /api/blog-agent, through the same USP brief and the same 90/100 SEO
 * gate; a post that cannot clear the gate is reported and skipped rather than
 * published thin.
 *
 * WHAT IT COSTS. Each article is a real Claude call, and a draft under the floor
 * is rewritten until it stops improving — so budget for more than one call per
 * feature. That is deliberate: a thin post published anyway is a page that will
 * never rank and cannot be cheaply un-indexed.
 *
 * BEFORE YOU RUN IT
 *   1. ANTHROPIC_API_KEY must be live on the deployment, or every post falls
 *      back to the offline demo article, which the SEO gate rejects.
 *      Check: curl -s https://www.joshrix.com/api/health | grep '"mode"'
 *   2. MODERATION_KEY must be in your environment, matching the deployment's.
 *   3. Run --dry-run first. It lists what would be written, in order, and calls
 *      nothing.
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The feature list, read out of its own source file.
 *
 * api/_features.ts is TypeScript and this is a plain Node script, so it is read
 * as text rather than imported — the same thing tools/check-catalogue.mjs does
 * with api/_gateway.ts. The alternative was --experimental-strip-types, and a
 * tool someone runs from a laptop should not depend on an experimental flag.
 *
 * tests/t16 asserts this parse finds every feature the module exports, so if the
 * shape of that file ever changes this fails in the suite rather than silently
 * publishing articles for nineteen of twenty-one features.
 */
export function readFeatures(src) {
  const text = src ?? fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "api", "_features.ts"), "utf8");
  const out = [];
  /* Each entry opens with its id and carries group, name and usp.edge before the
     next id begins. Matched per-block so a field order change cannot pair the
     wrong group with the wrong id. */
  const blocks = text.split(/\n  \{\n/).slice(1);
  for (const b of blocks) {
    const id = (b.match(/^\s*id: "([^"]+)"/m) || [])[1];
    const group = (b.match(/^\s*group: "([^"]+)"/m) || [])[1];
    const edge = (b.match(/^\s*edge: "((?:[^"\\]|\\.)*)"/m) || [])[1];
    const name = (b.match(/^\s*name: (?:"((?:[^"\\]|\\.)*)"|`([^`]*)`)/m) || []);
    if (!id || !group) continue;
    out.push({
      id, group,
      name: (name[1] ?? name[2] ?? id).replace(/\\"/g, '"'),
      usp: { edge: (edge ?? "").replace(/\\"/g, '"') },
    });
  }
  return out;
}

const FEATURES = readFeatures();

const args = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = args.indexOf("--" + name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = (argOf("base", "https://www.joshrix.com")).replace(/\/$/, "");
const ONLY = argOf("only");
const DRY = args.includes("--dry-run");
const SKIP_EXISTING = args.includes("--skip-existing");
const KEY = process.env.MODERATION_KEY || "";

const say = (s) => console.log(s);
const fail = (s) => console.log("  ! " + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The order a reader should meet the platform, not the order the array happens
 * to be in. Create first, because nobody cares what a sale pays until they
 * believe a game can exist; then the money, which is the next question; then
 * everything that happens after publishing, which only matters once the first
 * two are settled. Trust is woven through rather than batched, so the blog never
 * runs five consecutive posts about scanning.
 */
const ORDER = ["Create", "Assets", "Economics", "Trust", "Publish & Sell", "Growth"];
const queue = [...FEATURES].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
const chosen = ONLY ? queue.filter((f) => f.id === ONLY) : queue;

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": KEY },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body: parsed };
}

say(`\nbase     ${BASE}`);
say(`features ${chosen.length} of ${FEATURES.length}${DRY ? "   (dry run — nothing will be written)" : ""}`);

if (ONLY && !chosen.length) {
  fail(`no feature with id "${ONLY}". Ids are: ${FEATURES.map((f) => f.id).join(", ")}`);
  process.exit(2);
}
if (!KEY && !DRY) {
  fail("MODERATION_KEY is not set — /api/blog-agent fails closed and would refuse every post.");
  process.exit(2);
}

/* A live check before spending anything: without a provider key every article
   is the offline demo stub, which the SEO gate rejects — twenty-one wasted
   round trips that each look like a failure for the wrong reason. */
if (!DRY) {
  try {
    const h = await (await fetch(BASE + "/api/health")).json();
    say(`health   mode=${h.mode ?? "unknown"}`);
    if (h.mode === "demo") {
      fail("the deployment reports mode=demo — no provider key is live, so every draft would be the offline stub and fail the gate.");
      process.exit(2);
    }
  } catch (e) {
    fail(`could not read /api/health (${String(e.message).slice(0, 60)}) — continuing, but the first post will tell you the same thing.`);
  }
}

/* Which slugs already exist, so a re-run tops up rather than duplicating. The
   index is public, so this needs no key. */
let existing = new Set();
if (SKIP_EXISTING) {
  try {
    const idx = await (await fetch(BASE + "/api/blog-agent?public=1")).json();
    const posts = Array.isArray(idx) ? idx : (idx.posts ?? []);
    existing = new Set(posts.map((p) => String(p.title ?? "").toLowerCase()));
    say(`existing ${existing.size} posts already published`);
  } catch {
    fail("could not read the published index — ignoring --skip-existing");
  }
}

say("");
let written = 0, refused = 0, failed = 0, skipped = 0;

for (const [i, f] of chosen.entries()) {
  const tag = `${String(i + 1).padStart(2)}/${chosen.length}  ${f.group.padEnd(14)} ${f.id}`;

  if (SKIP_EXISTING && existing.has(f.name.toLowerCase())) {
    say(`${tag}  skipped — already published`);
    skipped++;
    continue;
  }
  if (DRY) {
    say(`${tag}`);
    say(`        edge: ${f.usp.edge.slice(0, 96)}${f.usp.edge.length > 96 ? "…" : ""}`);
    continue;
  }

  const r = await post("/api/blog-agent", { topic: `FEATURE:${f.id}` });
  if (r.status === 200 && r.body?.ok) {
    say(`${tag}  ✓ ${r.body.seoScore}/100  ${r.body.url}`);
    written++;
  } else if (r.status === 422) {
    /* The gate did its job. Not an error to retry blindly: the draft stopped
       improving, and publishing it anyway is the thing the gate exists to stop. */
    say(`${tag}  ✗ refused at ${r.body?.report?.total ?? "?"}/100 — below the floor, not published`);
    refused++;
  } else {
    say(`${tag}  ! HTTP ${r.status} ${String(r.body?.error ?? "").slice(0, 80)}`);
    failed++;
  }

  /* Paced, not hammered: each call is a long generation plus rewrites, and a
     burst of twenty-one is how you meet a rate limit halfway through. */
  if (i < chosen.length - 1) await sleep(3000);
}

say("");
if (DRY) {
  say(`would write ${chosen.length} articles, one per feature, in the order above.`);
  say(`drop --dry-run to run it. Each one is a real Claude call and may be rewritten more than once.`);
} else {
  say(`published ${written}   refused ${refused}   failed ${failed}   skipped ${skipped}`);
  if (refused) say(`a refusal is the SEO gate holding the floor — re-run that feature with --only <id> to try again.`);
  if (written) say(`check them at ${BASE}/blog`);
}
process.exit(failed ? 1 : 0);

/**
 * Find the devices that make an interface look generated, everywhere at once.
 *
 *   node tools/design-audit.mjs            every page and server-rendered view
 *   node tools/design-audit.mjs --fix-list just the file:count summary
 *
 * A redesign done page by page drifts: the tenth page quietly keeps the
 * gradient the first one lost, and nobody notices until it is on the site.
 * This greps for the specific tells rather than trusting a read-through.
 *
 * It reports; it never edits. Some hits are legitimate — a game's own palette,
 * a progress bar that really is the accent — so the output is a list to judge,
 * not a score to drive to zero.
 */
import fs from "node:fs";
import path from "node:path";

const TELLS = [
  // the old brand, in any form
  ["old palette", /#(7C3AED|A855F7|22D3EE|E879F9)\b|rgba\((124,58,237|34,211,238|168,85,247|232,121,249)/gi],
  ["old fonts", /Orbitron|Rajdhani/gi],
  // a headline that shouts
  ["uppercase heading", /(?:^|[\s,>])h[1-4][^{;]{0,40}\{[^}]*text-transform:\s*uppercase/gim],
  // Small uppercase labels NEED tracking — 0.08 to 0.16em is correct
  // typography, not a tell. What was wrong was 0.3em on headlines and body
  // copy. The threshold sits above legitimate label spacing so the report
  // stays worth reading; the wordmark descriptor at .22em is a deliberate
  // lockup and is the one known exception.
  ["wide tracking", /letter-spacing:\s*\.([3-9])\d*em/gi],
  // gradient text is the single most recognisable tell
  ["gradient text", /-webkit-background-clip:\s*text|background-clip:\s*text/gi],
  // A glow is zero offset, NON-zero blur, in colour. Anchoring at the
  // property matters: a loose pattern also matches "0 0 0 3px", which is a
  // focus ring — flagging those teaches you to ignore the report.
  // var() had to be included too: two glows written as var(--cyan) survived
  // an rgba-only sweep that reported itself clean.
  ["coloured glow", /box-shadow:\s*(?:inset\s+)?0 0 [1-9]\d*px\s+(?:rgba\((?!0,0,0)|var\(--)/gi],
  ["text glow", /text-shadow:[^;}]*rgba\((?!0,0,0)/gi],
  ["clipped corners", /clip-path:\s*polygon/gi],
  ["animated gradient", /animation:[^;}]*\bgs\b|background-size:\s*200%/gi],
];

const roots = [
  ...fs.readdirSync("frontend").filter((f) => f.endsWith(".html")).map((f) => path.join("frontend", f)),
  ...fs.readdirSync("api").filter((f) => f.endsWith(".ts")).map((f) => path.join("api", f)),
  "frontend/assets/joshrix.css",
  ...fs.readdirSync("frontend/assets").filter((f) => f.endsWith(".js")).map((f) => path.join("frontend/assets", f)),
];

/* The 3D and 2D engines choose a palette to fit each GAME's concept — a neon
   cyberpunk game should look neon. That is content, not chrome. */
const CONTENT = /_engine(3d)?\.ts$/;

const rows = [];
for (const f of roots) {
  if (CONTENT.test(f)) continue;
  let s;
  try { s = fs.readFileSync(f, "utf8"); } catch { continue; }
  s = s.replace(/base64,[A-Za-z0-9+/=]+/g, "B64");
  // Comments describe the old design in order to explain why it went. Matching
  // prose would keep this file permanently "failing" for saying the word
  // Orbitron, which is how a report stops being read.
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const hits = {};
  for (const [name, re] of TELLS) {
    const n = (s.match(re) || []).length;
    if (n) hits[name] = n;
  }
  if (Object.keys(hits).length) rows.push([f, hits]);
}

rows.sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));

if (process.argv.includes("--fix-list")) {
  for (const [f, h] of rows) console.log(`${Object.values(h).reduce((a, b) => a + b, 0)}\t${f}`);
} else {
  const totals = {};
  for (const [, h] of rows) for (const [k, v] of Object.entries(h)) totals[k] = (totals[k] || 0) + v;
  console.log(`${rows.length} file(s) with something to look at\n`);
  for (const [f, h] of rows) {
    console.log(`  ${path.basename(f).padEnd(24)} ${Object.entries(h).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  }
  console.log("\nBY KIND");
  for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`);
}
process.exit(0);

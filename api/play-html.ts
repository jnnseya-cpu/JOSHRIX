/**
 * GET /play/:id — the game page shell, with the GAME'S OWN share card.
 *
 * WHY THIS EXISTS. /play/:id used to rewrite straight to the static
 * frontend/play.html, which sets document.title in JavaScript and nothing else.
 * Link unfurlers do not run JavaScript. So every shared game link — the single
 * strongest organic asset this platform has, and the thing index.html builds its
 * whole argument on ("we win the queue, the group chat, the fanbase drop") —
 * arrived in WhatsApp, Discord, X and Slack with the generic site card at best,
 * and no title, no description and no image before that.
 *
 * WHAT THIS DOES NOT TOUCH: the paywall. api/game-html.ts remains the only thing
 * that decides who receives a game's bytes, and it is not called from here. This
 * route reads METADATA ONLY — getGame() defaults to withHtml=false, so the query
 * cannot return the game itself even by accident.
 *
 * WHAT A SHARED LINK MAY REVEAL. Only what /api/arcade already publishes to
 * anyone: title, summary and play count, and only for games a human reviewer has
 * APPROVED. A pending or rejected game gets the generic shell plus noindex — its
 * title is not public yet, and a creator's unreleased work must not be
 * discoverable through a card.
 *
 * FAILURE IS THE OLD BEHAVIOUR. If the shell cannot be read, or the database is
 * unavailable, the static page is served unchanged. A share card is worth having;
 * it is not worth a game being unplayable, so every path here degrades to what
 * happened before rather than to an error.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb, ensureGameSchema, getGame } from "./_ledger";
import { gameJsonLd, esc, SITE } from "./_seo";

const START = "<!-- seo-head:start -->";
const END = "<!-- seo-head:end -->";

/** The shell, read once per warm container. It is bundled by the includeFiles
 *  entry in vercel.json; without that this read fails and the route falls back. */
let SHELL: string | null | undefined;
function shell(): string | null {
  if (SHELL !== undefined) return SHELL;
  /* Walk up from both the working directory and this file. Vercel's bundle
     layout is not something to hard-code a single guess at: the function may run
     with cwd at the project root or at the function root depending on how it was
     built, and the compiled file sits a variable number of directories below it.
     Five levels covers every layout this has been seen in, and the loop costs
     nothing because the result is cached for the life of the container. */
  const roots = [process.cwd(), __dirname];
  for (const root of roots) {
    let dir = root;
    for (let up = 0; up < 5; up++) {
      try {
        SHELL = fs.readFileSync(path.join(dir, "frontend", "play.html"), "utf8");
        return SHELL;
      } catch { /* not here */ }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  SHELL = null;
  return SHELL;
}

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id ?? "");
  const html = shell();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  /* Short at the browser, longer at the edge: a freshly approved game should
     start unfurling correctly quickly, and unfurlers hit this far more than
     players do. */
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");

  const send = (body: string, code = 200) =>
    res.status(code).send ? res.status(code).send(body) : (res.statusCode = code, res.end(body));

  /* No shell means no page to decorate. Hand the request to the static file
     rather than inventing one — the game must still be playable. */
  if (!html) return res.redirect ? res.redirect(302, `/play.html?id=${encodeURIComponent(id)}`)
    : send(`<!DOCTYPE html><meta http-equiv="refresh" content="0;url=/play.html?id=${esc(id)}">`);

  if (!/^g-[a-z0-9-]{3,80}$/.test(id)) return send(withHead(html, null), 200);

  let game: any = null;
  try {
    const sql = getDb();
    if (sql) {
      await ensureGameSchema(sql);
      /* METADATA ONLY. getGame's default omits the html column entirely. */
      const row = await getGame(sql, id);
      if (row && row.status === "approved") game = row;
    }
  } catch { /* the card is optional; the game is not */ }

  return send(withHead(html, game), 200);
}

/** Replace the generic card block with this game's own. */
function withHead(html: string, game: any): string {
  const i = html.indexOf(START);
  const j = html.indexOf(END);
  if (i === -1 || j === -1) return html;

  if (!game) {
    /* Unknown, pending or rejected. Keep the generic card so the link still
       looks like something, and tell crawlers not to index a URL whose content
       they cannot see and whose game may never go public. */
    const generic = html.slice(i, j + END.length).replace(
      START,
      `${START}\n<meta name="robots" content="noindex,follow">`,
    );
    return html.slice(0, i) + generic + html.slice(j + END.length);
  }

  const url = `${SITE}/play/${game.id}`;
  const title = String(game.title || "A game forged on JOSHRIX");
  /* A summary written for a card, not a database column: enough to make someone
     tap, and honest about what they get. */
  const desc = String(game.summary || "").trim().slice(0, 180)
    || `${title} — a browser game made on JOSHRIX Studio. Play it free, no download and no account.`;
  const priced = game.price_minor != null && Number(game.price_minor) > 0;

  const block = [
    START,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="JOSHRIX Studio">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="en_GB">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}/assets/og-cover.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(title)} — playable on JOSHRIX Studio">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${SITE}/assets/og-cover.png">`,
    `<script type="application/ld+json">${gameJsonLd({
      id: game.id, title, summary: game.summary,
      created_at: game.created_at, plays: Number(game.plays ?? 0),
      priceMinor: priced ? Number(game.price_minor) : null,
    })}</script>`,
    END,
  ].join("\n");

  const out = html.slice(0, i) + block + html.slice(j + END.length);
  /* The <title> is what a search result and a browser tab show; play.html's own
     JavaScript sets it too, but only for visitors who run scripts. */
  return out.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)} — Play free on JOSHRIX</title>`)
            .replace(/<meta name="description" content="[^"]*">/i,
                     `<meta name="description" content="${esc(desc)}">`);
}

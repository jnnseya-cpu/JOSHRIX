/**
 * POST /api/games — Build 1: game persistence + public play URLs.
 * Body: { title, html, summary?, language?, walletId?, email? }
 * Saves the forged game and returns { id, playUrl, status: "pending_review" }.
 * Publishing IS the moment the creator accepts the build, so it is also the
 * moment the forge is paid for: the held ACUs settle to what the run actually
 * cost and the remainder is refunded. A build that is never published costs the
 * creator nothing — but a build that IS published always costs, which is why the
 * settlement runs before the save and a publish that cannot collect is refused.
 * Every game enters the moderation queue (Build 3) before its /play/<id> URL
 * serves to the public; the creator can preview immediately via ?preview=1.
 */
import { randomUUID } from "node:crypto";
import { getDb, ensureGameSchema, saveGame, getWallet, countPendingByWallet, acceptForgeCharge, creditWallet, getForgeCharge, recollectRefundedForge } from "./_ledger";
import { notify } from "./_notify";
import { EMAIL_RE } from "./_guard";

const MAX_PENDING_PER_WALLET = 10;

const MAX_HTML_BYTES = 900_000; // self-contained games are ~450 lines; anything huge is suspect

function slug(title: string): string {
  const s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return s || "game";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Game hosting is not configured yet (DATABASE_URL missing).", mode: "no_db" });

  const { title, html, summary, language, walletId, email, forgeId } = (req.body ?? {}) as Record<string, string>;
  if (!title || typeof title !== "string" || title.trim().length < 2) {
    return res.status(400).json({ error: "A game `title` is required." });
  }
  if (!html || typeof html !== "string" || !/^\s*<!doctype html>/i.test(html) || !html.includes("<canvas")) {
    return res.status(400).json({ error: "`html` must be a complete forged game (doctype + canvas)." });
  }
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return res.status(413).json({ error: "Game HTML too large to host." });
  }

  try {
    await ensureGameSchema(sql);

    // publishing requires a real wallet — the same bearer secret that forged the game
    if (!walletId) return res.status(401).json({ error: "A wallet is required to publish — open the Studio first." });
    const wallet = await getWallet(sql, walletId);
    if (!wallet) return res.status(401).json({ error: "Unknown wallet — open the Studio to initialise one." });

    // anti-flood: bounded review queue per wallet
    const pending = await countPendingByWallet(sql, walletId);
    if (pending >= MAX_PENDING_PER_WALLET) {
      return res.status(429).json({ error: `You already have ${pending} games awaiting review — wait for moderation before publishing more.` });
    }

    // notifications go ONLY to the wallet's registered email (never a caller-supplied
    // address — that would be an open relay); a valid body email may set the record.
    const creatorEmail = (email && EMAIL_RE.test(email) ? email : null) ?? wallet.email ?? null;

    /* ---- ACCEPT: publishing is the creator keeping the build, so this is where
       the forge is finally paid for — and it happens BEFORE the save.

       It used to run afterwards, best-effort, on the reasoning that a billing
       hiccup must never lose a game the creator had committed to. That was the
       wrong trade: it also meant a publish went through when the charge could
       NOT be collected, and /api/forge-refund is asserted by the client. Forge,
       claim the render-failure refund, then publish, and the game was free —
       repeatable, and visible to anyone reading the network tab.

       So the order is inverted. Nothing is hosted until the run is paid for.
       The creator is never charged for a build they walk away from — that
       promise is untouched, because walking away is not publishing. ---- */
    let acuCharged: number | undefined, acuRefunded: number | undefined;
    if (!forgeId || typeof forgeId !== "string") {
      return res.status(402).json({
        error: "This build cannot be published because it is not linked to a forge run. Forge the game again from the Studio and publish that build.",
        code: "forge_unlinked",
      });
    }
    const settled = await acceptForgeCharge(sql, forgeId, walletId);
    if (settled) {
      acuCharged = settled.charged;
      acuRefunded = settled.refund;
      if (settled.refund > 0) await creditWallet(sql, walletId, settled.refund);
    } else {
      // The hold is gone: already settled, or refunded as a render failure. A
      // refunded build being published is a contradiction — collect it again.
      const charge = await getForgeCharge(sql, forgeId, walletId);
      if (!charge) {
        return res.status(402).json({
          error: "That forge run does not belong to this wallet, so it cannot be published from here.",
          code: "forge_unknown",
        });
      }
      if (charge.accepted_at) {
        acuCharged = Math.min(Number(charge.settle_amount), Number(charge.amount));  // already paid — republish of the same build
      } else {
        const collected = await recollectRefundedForge(sql, forgeId, walletId);
        if (collected === null) {
          const owed = Math.min(Number(charge.settle_amount), Number(charge.amount));
          return res.status(402).json({
            error: `This build was refunded as a failed render, so publishing it costs ${owed} ACUs to settle — and there aren't enough in the wallet. Top up at /wallet.html.`,
            code: "forge_refunded_unpaid",
            acuRequired: owed,
          });
        }
        acuCharged = collected;
        acuRefunded = 0;
      }
    }

    const id = "g-" + slug(title) + "-" + randomUUID().replace(/-/g, "").slice(0, 10);
    await saveGame(sql, {
      id,
      title: title.trim().slice(0, 120),
      summary: summary?.slice(0, 500) ?? null,
      language: language?.slice(0, 40) ?? null,
      html,
      creatorWallet: walletId,
      creatorEmail,
    });

    await notify("game.submitted", wallet.email ?? null, { game: title.trim().slice(0, 60) });
    return res.status(200).json({
      id,
      playUrl: `/play/${id}`,
      status: "pending_review",
      ...(acuCharged !== undefined ? { acuCharged, acuRefunded } : {}),
      note: "Your game is saved. It goes public at its play URL once moderation approves it; you can playtest it now via the preview link.",
      previewUrl: `/play/${id}?preview=1&w=${encodeURIComponent(walletId)}`,
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not save game", detail: String(err?.message ?? err) });
  }
}

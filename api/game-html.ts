/**
 * GET /api/game-html?id=<gameId>[&preview=1][&w=<walletId>] — serves a hosted
 * game to /play/<id>.
 *
 * Rules (Build 3 moderation gate):
 *   approved        → metadata + html, play count bumped
 *   pending_review  → html ONLY with ?preview=1 AND a matching creator wallet
 *   rejected        → status + review note, never the html
 *
 * PAYWALL. A game with a price is served only to someone entitled to it: the
 * creator, a buyer with an unrevoked entitlement, or moderation. Everyone else
 * gets the metadata and the price, which is what the store page needs anyway.
 *
 * This endpoint IS the paywall — there is nowhere else it can live. The game is
 * a self-contained HTML file, so the moment its bytes are in the response the
 * purchase is unenforceable. hasEntitlement() had existed since the marketplace
 * shipped and was called by nothing, so every listed game played free at its
 * public URL while its store page asked for money.
 */
import { getDb, ensureGameSchema, getGame, bumpPlays, hasEntitlement } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Game hosting is not configured yet (DATABASE_URL missing).", mode: "no_db" });

  const id = String(req.query?.id ?? "");
  if (!/^g-[a-z0-9-]{3,80}$/.test(id)) return res.status(400).json({ error: "Invalid game id" });
  const preview = String(req.query?.preview ?? "") === "1";
  const viewerWallet = String(req.query?.w ?? "");   // bearer secret: proves creator or buyer
  const adminKey = req.headers?.["x-admin-key"];
  const isAdmin = !!process.env.MODERATION_KEY && adminKey === process.env.MODERATION_KEY;

  try {
    await ensureGameSchema(sql);
    const game = await getGame(sql, id, true);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const priceMinor = game.price_minor == null ? null : Number(game.price_minor);
    const isCreator = !!game.creator_wallet && !!viewerWallet && viewerWallet === game.creator_wallet;

    const meta = {
      id: game.id,
      title: game.title,
      summary: game.summary,
      language: game.language,
      status: game.status,
      plays: Number(game.plays ?? 0),
      createdAt: game.created_at,
      ...(priceMinor ? { priceMinor } : {}),
    };

    if (game.status === "approved") {
      // Free game: anyone may play it. Priced game: only someone who owns it.
      if (priceMinor && priceMinor > 0 && !isCreator && !isAdmin) {
        const owns = !!viewerWallet && await hasEntitlement(sql, id, viewerWallet);
        if (!owns) {
          // 200, not 403: this is the store page for a game that exists and is
          // on sale, not a failure. The client renders a buy button from it.
          return res.status(200).json({
            ...meta,
            locked: true,
            note: "This world is on sale. Buy it once and it plays here on any device you sign into.",
            buyUrl: `/marketplace.html?game=${encodeURIComponent(id)}`,
          });
        }
      }
      await bumpPlays(sql, id);
      return res.status(200).json({ ...meta, plays: meta.plays + 1, html: game.html });
    }

    if (game.status === "pending_review" && preview) {
      // Unapproved HTML goes to its creator or to moderation, and to nobody else.
      // The old predicate began `!game.creator_wallet ||`, which meant a game with
      // no creator wallet — anything imported, migrated or saved before wallets
      // were required — previewed for any stranger who guessed its id.
      if (!isCreator && !isAdmin) {
        return res.status(200).json({ ...meta, note: "This game is in moderation review and will be playable once approved." });
      }
      return res.status(200).json({ ...meta, html: game.html, note: "Creator preview — public once approved." });
    }
    if (game.status === "pending_review") {
      return res.status(200).json({ ...meta, note: "This game is in moderation review and will be playable once approved." });
    }
    return res.status(200).json({ ...meta, note: "This game was not approved for public play." });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not load game", detail: String(err?.message ?? err) });
  }
}

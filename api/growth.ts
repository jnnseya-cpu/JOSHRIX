/**
 * POST /api/growth — the AI Growth Engine: marketing tools for creators.
 * Body: { tool, walletId, gameId?, brief?, audience?, tone?, language? }
 *
 * Six generators write real copy with the AI chain (metered like every other
 * AI call — hold, settle to 4x actual, refund the difference). Four advisors
 * combine the AI with the creator's OWN platform numbers.
 *
 * Rule applied throughout: advisors never invent metrics. When a creator has no
 * plays yet, they are told so and given the pre-launch playbook instead of
 * fabricated analytics.
 */
import { generateGrowthCopy, acuChargeForUsage, GROWTH_HOLD, GROWTH_MIN_CHARGE } from "./_gateway";
import { getDb, ensureGameSchema, debitWallet, creditWallet, getGame, listGamesByWallet } from "./_ledger";
import { clientIp, rateLimit, tooMany, forgeDisabled } from "./_guard";

export const GROWTH_TOOLS = [
  "social_posts", "game_advert", "email_campaign", "landing_page",
  "hashtags", "video_script", "performance", "audience", "posting_time",
] as const;
export type GrowthTool = (typeof GROWTH_TOOLS)[number];

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const paused = forgeDisabled();
  if (paused) return res.status(503).json({ error: paused });

  const { tool, walletId, gameId, brief, audience, tone, language } = (req.body ?? {}) as Record<string, string>;
  if (!GROWTH_TOOLS.includes(tool as GrowthTool)) {
    return res.status(400).json({ error: `tool must be one of: ${GROWTH_TOOLS.join(", ")}` });
  }

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Growth tools need the platform database — unavailable right now." });

  const rl = await rateLimit(sql, "growth:" + clientIp(req), 40, 3600);
  if (!rl.ok) return tooMany(res, rl.retryAfter, "growth requests");
  if (!walletId) return res.status(402).json({ error: "Sign in to use the Growth Engine — results are billed to your wallet." });

  try {
    await ensureGameSchema(sql);

    // Real context: the creator's own game and their own numbers. Never invented.
    let game: any = null;
    if (gameId) game = await getGame(sql, String(gameId));
    const myGames = await listGamesByWallet(sql, walletId, 50);
    const approved = myGames.filter((g: any) => g.status === "approved");
    const totalPlays = myGames.reduce((s: number, g: any) => s + Number(g.plays ?? 0), 0);

    const facts = {
      gameTitle: game?.title ?? approved[0]?.title ?? null,
      gameSummary: game?.summary ?? null,
      gameUrl: game?.id ? `https://www.joshrix.com/play/${game.id}` : (approved[0]?.id ? `https://www.joshrix.com/play/${approved[0].id}` : null),
      publishedGames: approved.length,
      totalPlays,
      bestGame: approved.slice().sort((a: any, b: any) => Number(b.plays ?? 0) - Number(a.plays ?? 0))[0] ?? null,
    };

    // ADVISORS: refuse to fabricate. With no published game or no plays there is
    // nothing to analyse, and saying so is more useful than inventing a chart.
    if ((tool === "performance" || tool === "audience" || tool === "posting_time") && facts.publishedGames === 0) {
      return res.status(200).json({
        tool, charged: 0,
        insufficientData: true,
        headline: "No published games yet — nothing to analyse.",
        guidance: [
          "Publish your first game: advice based on zero data would be guesswork.",
          "Use the generators (social posts, advert, hashtags) to prepare your launch copy now.",
          "Come back after ~50 plays and these advisors will work from your real numbers.",
        ],
        note: "This tool reports only on your real platform data. It was free because there was nothing to compute.",
      });
    }
    if (tool === "posting_time" && totalPlays < 30) {
      return res.status(200).json({
        tool, charged: 0,
        insufficientData: true,
        headline: `Only ${totalPlays} plays so far — too few to find your audience's rhythm.`,
        guidance: [
          "Posting-time advice needs roughly 30+ plays before a pattern is real rather than noise.",
          "Until then, post when YOU can reply to comments — early engagement matters more than timing.",
        ],
        note: "No charge: real timing analysis needs real traffic, and inventing it would mislead you.",
      });
    }

    // Everything below runs the AI, so it is metered exactly like a forge.
    let balanceAfter: number | null = await debitWallet(sql, walletId, GROWTH_HOLD);
    if (balanceAfter === null) {
      return res.status(402).json({ error: `Not enough ACUs (a growth tool holds ${GROWTH_HOLD}; the unused part refunds on settlement).`, acuCharge: GROWTH_HOLD });
    }

    try {
      const out = await generateGrowthCopy(tool as GrowthTool, {
        brief: String(brief ?? "").slice(0, 2000),
        audience: String(audience ?? "").slice(0, 300),
        tone: String(tone ?? "").slice(0, 80),
        language: String(language ?? "").slice(0, 40),
        facts,
      });

      const meterKey = out.provider === "claude" ? "claude-sonnet-5" : out.provider;
      const settled = Math.max(GROWTH_MIN_CHARGE, out.usage ? acuChargeForUsage(meterKey, out.usage) : GROWTH_MIN_CHARGE);
      if (settled !== GROWTH_HOLD) {
        try {
          const nb = settled < GROWTH_HOLD
            ? await creditWallet(sql, walletId, GROWTH_HOLD - settled)
            : await debitWallet(sql, walletId, settled - GROWTH_HOLD);
          if (nb !== null) balanceAfter = nb;
        } catch { /* settlement best-effort; reconciliation catches strays */ }
      }

      return res.status(200).json({
        tool, provider: out.provider, charged: settled, balanceAfter,
        result: out.result,
        basedOn: { publishedGames: facts.publishedGames, totalPlays: facts.totalPlays, game: facts.gameTitle },
      });
    } catch (err: any) {
      // the AI failed — give the hold straight back, in full
      try { await creditWallet(sql, walletId, GROWTH_HOLD); } catch { /* reconciliation */ }
      return res.status(502).json({ error: "The Growth Engine could not complete this request — your hold was refunded in full.", detail: String(err?.message ?? err).slice(0, 200) });
    }
  } catch (err: any) {
    return res.status(502).json({ error: "Growth request failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}

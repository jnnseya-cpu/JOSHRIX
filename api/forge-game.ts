/**
 * POST /api/forge-game — the Code Agent forges a REAL playable game.
 * Body: { prompt, title?, summary?, language?, walletId? }
 * Returns: { html, provider, acuCharge, balanceAfter? } — a complete self-contained
 * HTML5 game implementing the creator's concept. Long-running: see vercel.json.
 * Build 2 (server-side ACU enforcement): with DATABASE_URL configured the 300-ACU
 * forge charge is debited server-side BEFORE generation and refunded on failure.
 */
import { randomUUID } from "crypto";
import { generateGameHtml, looksPlayable, acuChargeForUsage, FORGE_GAME_ACU_CHARGE, FORGE_GAME_3D_ACU_CHARGE, FORGE_MIN_CHARGE, ENGINE_BUILD_CHARGE } from "./_gateway";
import { buildPlayableGame } from "./_engine";
import { getDb, ensureGameSchema, debitWallet, creditWallet, recordForgeCharge, saveForgeResult, recordForgeLog } from "./_ledger";
import { recordSecurityEvent } from "./_guard";
import { scanConcept, sanitiseConcept } from "./_security";
import { clientIp, rateLimit, tooMany, forgeDisabled } from "./_guard";
import type { GameBlueprint } from "../shared/contracts";

/** Coerce whatever the client sends as a blueprint into the shape the engine needs. */
function coerceBlueprint(bp: any, prompt: string, title?: string, summary?: string, language?: string): GameBlueprint {
  const b = bp && typeof bp === "object" ? bp : {};
  return {
    language: b.language || language || "en",
    title: String(b.title || title || prompt.slice(0, 48) || "Your Game"),
    summary: String(b.summary || summary || prompt.slice(0, 160)),
    genre: Array.isArray(b.genre) && b.genre.length ? b.genre.map(String) : ["Arcade"],
    coreLoop: Array.isArray(b.coreLoop) ? b.coreLoop.map(String) : ["Play"],
    targetAudience: String(b.targetAudience || "Everyone"),
    mechanics: Array.isArray(b.mechanics) ? b.mechanics.map(String) : [],
    characters: Array.isArray(b.characters) ? b.characters.map((c: any) => ({ name: String(c?.name || "Foe"), role: String(c?.role || "") })) : [],
    levels: Array.isArray(b.levels) && b.levels.length ? b.levels.map((l: any) => ({ name: String(l?.name || "Level"), objective: String(l?.objective || "") })) : [{ name: "Level 1", objective: "Score points" }],
    monetisationModel: String(b.monetisationModel || "Freemium"),
    assetList: Array.isArray(b.assetList) ? b.assetList.map(String) : [],
    technicalComplexity: (b.technicalComplexity === "low" || b.technicalComplexity === "high") ? b.technicalComplexity : "medium",
    estimatedCredits: Number.isFinite(b.estimatedCredits) ? b.estimatedCredits : 1200,
    suggestedPriceGBP: Number.isFinite(b.suggestedPriceGBP) ? b.suggestedPriceGBP : 4.99,
    commercialScore: Number.isFinite(b.commercialScore) ? b.commercialScore : 80,
    riskScore: Number.isFinite(b.riskScore) ? b.riskScore : 15,
    marketplaceCategory: String(b.marketplaceCategory || "Arcade"),
  } as GameBlueprint;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, title, summary, language, walletId, blueprint, mode, ticket } = (req.body ?? {}) as Record<string, any>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include the game concept in `prompt`." });
  }
  if (prompt.length > 20000) {
    return res.status(400).json({ error: "Prompt too long (max 20,000 chars)." });
  }
  const paused = forgeDisabled();
  if (paused) return res.status(503).json({ error: paused });

  /* The concept is arbitrary public text. Strip the characters that hide it
     from a human reviewer, then judge its SHAPE — never its subject. A horror
     game about hackers is a game; text addressed to the model is not. */
  const concept = sanitiseConcept(prompt);
  const verdict = scanConcept(concept);
  if (verdict.action !== "allow") {
    const sqlEarly = getDb();
    if (sqlEarly) {
      await recordSecurityEvent(sqlEarly, "concept_flagged", verdict.action === "block" ? "block" : "warn", {
        ip: clientIp(req), risk: verdict.risk, reasons: verdict.reasons,
        excerpt: concept.slice(0, 400), walletId: walletId ?? null,
      });
    }
    if (verdict.action === "block") {
      // No charge is taken: nothing was generated, so nothing is owed.
      return res.status(400).json({
        error: "That description reads as instructions aimed at the AI rather than a game concept, so it was not run.",
        reasons: verdict.reasons,
        help: "Describe the game you want — the world, the player, what they do, how they win. Your ACUs are untouched.",
      });
    }
  }

  const is3d = mode === "3d";
  const CHARGE = is3d ? FORGE_GAME_3D_ACU_CHARGE : FORGE_GAME_ACU_CHARGE;

  // Server-side wallet enforcement (active once DATABASE_URL is set)
  const sql = getDb();
  let balanceAfter: number | null = null;
  if (sql) {
    // DENIAL-OF-WALLET GUARD. Every forge spends real provider money, so the
    // rate limit is per IP *and* per wallet — a stolen wallet id cannot be
    // driven from many machines, and one machine cannot cycle many wallets.
    const ipRl = await rateLimit(sql, "forge:ip:" + clientIp(req), 30, 3600);
    if (!ipRl.ok) return tooMany(res, ipRl.retryAfter, "game builds");
    if (walletId) {
      const wRl = await rateLimit(sql, "forge:w:" + String(walletId).slice(0, 80), 20, 3600);
      if (!wRl.ok) return tooMany(res, wRl.retryAfter, "game builds on this account");
    }
    if (!walletId) return res.status(402).json({ error: "No wallet — open the Studio to initialise your ACU wallet, or top up at /wallet.html." });
    try {
      await ensureGameSchema(sql);
      balanceAfter = await debitWallet(sql, walletId, CHARGE);
    } catch (err: any) {
      return res.status(502).json({ error: "Wallet check failed", detail: String(err?.message ?? err) });
    }
    if (balanceAfter === null) {
      return res.status(402).json({ error: `Not enough ACUs (this forge costs ${CHARGE}). Top up at /wallet.html.`, acuCharge: CHARGE });
    }
  }

  // Refund on failure, minus a small non-refundable compute floor when the AI
  // actually ran — otherwise "always fail on purpose" farms free model calls.
  const COMPUTE_FLOOR = 50;
  const refund = async (aiRan: boolean) => {
    if (sql && walletId && balanceAfter !== null) {
      const back = aiRan ? CHARGE - COMPUTE_FLOOR : CHARGE;
      try { await creditWallet(sql, walletId, back); } catch { /* best-effort; reconciliation catches strays */ }
    }
  };

  try {
    // Hybrid build — fidelity AND reliability:
    //   1. The Code Agent writes the BESPOKE game from the creator's concept (the
    //      game they actually described). This is what ships when it works.
    //   2. The deterministic engine builds a guaranteed-playable fallback from the
    //      blueprint. If the bespoke build fails to render client-side, the Studio
    //      swaps to this fallback and auto-refunds — a blank screen is impossible.
    const bp = coerceBlueprint(blueprint, prompt, title, summary, language);
    const engineHtml = buildPlayableGame(bp);
    let html = engineHtml;
    let provider = "engine";
    let fallbackHtml: string | undefined;
    let aiUsage: { inputTokens: number; outputTokens: number } | undefined;
    let bespokeError: string | undefined;
    let attemptTrail: string[] = [];
    const genStart = Date.now();
    try {
      const ai = await generateGameHtml(concept, { title, summary, language, mode: is3d ? "3d" : "2d" });
      attemptTrail = ai.attempts ?? [];
      // A build rejected by the security scan is the loudest signal this
      // platform can produce: someone got a model to write hostile code that
      // would have been hosted here. Record it whether or not a later provider
      // then succeeded, because the attempt is the finding.
      const blocked = attemptTrail.filter((a) => a.indexOf("rejected by the security scan") !== -1);
      if (blocked.length && sql) {
        await recordSecurityEvent(sql, "malicious_build_blocked", "block", {
          ip: clientIp(req), walletId: walletId ?? null, mode: is3d ? "3d" : "2d",
          rejections: blocked, conceptExcerpt: concept.slice(0, 400),
        });
      }
      // any REAL provider build ships as bespoke (claude/gemini/openai); the
      // keyless demo build is weaker than the engine, so the engine wins there.
      // looksPlayable, not a literal <canvas> check — 3D builds create their
      // canvas from JavaScript and used to be silently rejected here.
      if (ai.provider !== "demo" && looksPlayable(ai.html)) {
        html = ai.html;
        provider = ai.provider;
        fallbackHtml = engineHtml;
        aiUsage = ai.usage;
      } else if (ai.provider !== "demo") {
        // a complete file came back but doesn't render a game — never reject silently
        bespokeError = `${ai.provider} returned a complete file with no canvas/WebGL scene — engine shipped instead`;
      }
    } catch (err: any) {
      // every provider failed — the engine build ships, but the WHY travels with
      // it so the Studio can name the exact per-provider failure instead of guessing
      bespokeError = String(err?.message ?? err).slice(0, 600);
    }
    // Server-side history: every forge outcome lands in /api/forge-log with the
    // provider that shipped (or 'engine' + the aggregated error) — diagnosable
    // from one URL, independent of what the creator's browser shows.
    if (sql) {
      // record the rejected providers too, not just total failure: knowing WHY
      // the first two were skipped is what explains a slow or surprising build
      const trail = bespokeError ?? (attemptTrail.length ? attemptTrail.join(" | ").slice(0, 600) : null);
      try { await recordForgeLog(sql, { provider, mode: is3d ? "3d" : "2d", ms: Date.now() - genStart, error: trail }); } catch { /* best-effort */ }
    }
    // METERED SETTLEMENT (business model: charge = 4x the AI provider cost of THIS
    // run, from actual token usage). The upfront debit was only a hold:
    //   bespoke shipped  -> 4x metered cost (floor FORGE_MIN_CHARGE)
    //   engine-only ship -> flat ENGINE_BUILD_CHARGE (no AI ran / AI unusable)
    // Unused hold is credited back instantly; shortfall is collected best-effort.
    const meterKey = provider === "claude" ? "claude-sonnet-5" : provider;  // gemini/openai rates in the table
    const settledCharge = provider !== "engine"
      ? Math.max(FORGE_MIN_CHARGE, aiUsage ? acuChargeForUsage(meterKey, aiUsage) : FORGE_MIN_CHARGE * 2)
      : ENGINE_BUILD_CHARGE;
    if (sql && walletId && balanceAfter !== null && settledCharge !== CHARGE) {
      try {
        if (settledCharge < CHARGE) {
          const nb = await creditWallet(sql, walletId, CHARGE - settledCharge);
          if (nb !== null) balanceAfter = nb;
        } else {
          const nb = await debitWallet(sql, walletId, settledCharge - CHARGE);
          if (nb !== null) balanceAfter = nb; // insufficient extra -> hold stands; reconciliation
        }
      } catch { /* settlement best-effort; ledger reconciliation catches strays */ }
    }
    // Single-use forge id so a build that fails to RENDER on the client can
    // auto-refund. Recorded only after a real charge, so a refund can't exceed the pay.
    let forgeId: string | undefined;
    if (sql && walletId && balanceAfter !== null) {
      forgeId = randomUUID();
      try { await recordForgeCharge(sql, forgeId, walletId, settledCharge); } catch { forgeId = undefined; }
    }
    const body = {
      html, provider, acuCharge: settledCharge,
      ...(bespokeError ? { bespokeError } : {}),
      ...(fallbackHtml ? { fallbackHtml } : {}),
      ...(forgeId ? { forgeId } : {}),
      ...(balanceAfter !== null ? { balanceAfter } : {}),
    };
    // Persist the finished build BEFORE responding: if this response never reaches
    // the browser (dropped connection, sleep), the Studio's poller still gets the
    // game from /api/forge-result — a completed forge can no longer be lost.
    if (sql && typeof ticket === "string" && /^[a-z0-9-]{8,64}$/i.test(ticket)) {
      try { await saveForgeResult(sql, ticket, walletId || null, JSON.stringify(body)); } catch { /* best-effort */ }
    }
    return res.status(200).json(body);
  } catch (err: any) {
    await refund(false);
    return res.status(502).json({ error: "Game build failed", detail: String(err?.message ?? err) });
  }
}

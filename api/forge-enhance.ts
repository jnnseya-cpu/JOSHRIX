/**
 * POST /api/forge-enhance — the Polish Agent raises a build's production value.
 * Body: { html, walletId?, notes?, language? }
 * Returns: { html, provider, acuCharge, forgeId?, balanceAfter? }
 *
 * The no-limits mechanism: one generation pass has a token ceiling, stacked passes
 * don't. Each pass takes the CURRENT build and returns a higher-fidelity version of
 * the same game; creators repeat as often as they like. Billing is the platform
 * model: 4x the metered AI cost of the pass (ENHANCE_HOLD held upfront, settled to
 * actual, unused hold refunded instantly). A pass that fails to render client-side
 * auto-refunds via the forge_charges ledger like any forge.
 */
import { randomUUID } from "crypto";
import { enhanceGameHtml, acuChargeForUsage, ENHANCE_HOLD, FORGE_MIN_CHARGE } from "./_gateway";
import { getDb, ensureGameSchema, debitWallet, creditWallet, recordForgeCharge } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { html, walletId, notes, language } = (req.body ?? {}) as Record<string, string>;
  if (!html || typeof html !== "string" || !html.includes("<canvas")) {
    return res.status(400).json({ error: "Body must include the current game `html` (a real build with a canvas)." });
  }
  if (html.length > 600_000) {
    return res.status(400).json({ error: "Game file too large to enhance (max 600KB)." });
  }

  const sql = getDb();
  let balanceAfter: number | null = null;
  if (sql) {
    if (!walletId) return res.status(402).json({ error: "No wallet — open the Studio to initialise your ACU wallet." });
    try {
      await ensureGameSchema(sql);
      balanceAfter = await debitWallet(sql, walletId, ENHANCE_HOLD);
    } catch (err: any) {
      return res.status(502).json({ error: "Wallet check failed", detail: String(err?.message ?? err) });
    }
    if (balanceAfter === null) {
      return res.status(402).json({ error: `Not enough ACUs (an enhance pass holds ${ENHANCE_HOLD}; the unused part refunds when it settles). Top up at /wallet.html.`, acuCharge: ENHANCE_HOLD });
    }
  }

  const refundHold = async () => {
    if (sql && walletId && balanceAfter !== null) {
      try { await creditWallet(sql, walletId, ENHANCE_HOLD); } catch { /* reconciliation */ }
    }
  };

  try {
    const out = await enhanceGameHtml(html, { notes, language });
    if (out.provider !== "claude" || !out.html.includes("<canvas")) {
      await refundHold();
      return res.status(502).json({ error: "Polish Agent unavailable or produced no playable file — hold refunded." });
    }
    // metered settlement: 4x actual cost of this pass, unused hold back instantly
    const settled = Math.max(FORGE_MIN_CHARGE, acuChargeForUsage("claude-sonnet-5", out.usage!));
    if (sql && walletId && balanceAfter !== null && settled !== ENHANCE_HOLD) {
      try {
        if (settled < ENHANCE_HOLD) {
          const nb = await creditWallet(sql, walletId, ENHANCE_HOLD - settled);
          if (nb !== null) balanceAfter = nb;
        } else {
          const nb = await debitWallet(sql, walletId, settled - ENHANCE_HOLD);
          if (nb !== null) balanceAfter = nb;
        }
      } catch { /* settlement best-effort */ }
    }
    let forgeId: string | undefined;
    if (sql && walletId && balanceAfter !== null) {
      forgeId = randomUUID();
      try { await recordForgeCharge(sql, forgeId, walletId, settled); } catch { forgeId = undefined; }
    }
    return res.status(200).json({ html: out.html, provider: out.provider, acuCharge: settled, ...(forgeId ? { forgeId } : {}), ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    await refundHold();
    return res.status(502).json({ error: "Enhance pass failed — hold refunded", detail: String(err?.message ?? err) });
  }
}

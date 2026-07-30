/**
 * GET /api/provider-selftest
 * Diagnostics: fires a tiny "say OK" request at every configured AI provider and
 * reports success, latency, and the EXACT error text on failure — so "which
 * provider is broken and why" is one URL, no key, no log hunt.
 * Cost control: unauthenticated calls are served from a 2-minute cache (the
 * probes cost a few real tokens); the admin key (?key=) forces a fresh run.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getDb, ensureGameSchema, saveForgeResult, getForgeResult } from "./_ledger";

const T = 30_000;
const CACHE_TICKET = "selftest-cache-0000";
const CACHE_MS = 120_000;

export default async function handler(req: any, res: any) {
  const key = (req.headers["x-admin-key"] as string) || (req.query?.key as string) || "";
  const isAdmin = !!process.env.MODERATION_KEY && key === process.env.MODERATION_KEY;

  const sql = getDb();
  if (!isAdmin && sql) {
    try {
      await ensureGameSchema(sql);
      const row = await getForgeResult(sql, CACHE_TICKET);
      if (row) {
        const cached = JSON.parse(row.payload);
        if (cached && cached.at && Date.now() - cached.at < CACHE_MS) {
          return res.status(200).json({ ...cached.body, cached: true, ageSeconds: Math.round((Date.now() - cached.at) / 1000) });
        }
      }
    } catch { /* run live */ }
  }

  const out: Record<string, any> = {};

  if (process.env.ANTHROPIC_API_KEY) {
    const t0 = Date.now();
    try {
      const anthropic = new Anthropic();
      const m = await anthropic.messages.create(
        { model: "claude-sonnet-5", max_tokens: 16, messages: [{ role: "user", content: "Reply with exactly: OK" }] },
        { timeout: T },
      );
      const text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      out.anthropic = { ok: /OK/i.test(text), ms: Date.now() - t0, reply: text.slice(0, 40) };
    } catch (e: any) {
      out.anthropic = { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 300) };
    }
  } else out.anthropic = { ok: false, error: "no ANTHROPIC_API_KEY" };

  if (process.env.GEMINI_API_KEY) {
    const t0 = Date.now();
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }], generationConfig: { maxOutputTokens: 16 } }),
        signal: AbortSignal.timeout(T),
      });
      const j: any = await r.json().catch(() => null);
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
      out.gemini = r.ok
        ? { ok: /OK/i.test(text), ms: Date.now() - t0, model, reply: text.slice(0, 40) }
        : { ok: false, ms: Date.now() - t0, model, error: `HTTP ${r.status}: ${JSON.stringify(j?.error?.message ?? j).slice(0, 300)}` };
    } catch (e: any) {
      out.gemini = { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 300) };
    }
  } else out.gemini = { ok: false, error: "no GEMINI_API_KEY" };

  if (process.env.OPENAI_API_KEY) {
    const t0 = Date.now();
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_completion_tokens: 16 }),
        signal: AbortSignal.timeout(T),
      });
      const j: any = await r.json().catch(() => null);
      const text = j?.choices?.[0]?.message?.content || "";
      out.openai = r.ok
        ? { ok: /OK/i.test(text), ms: Date.now() - t0, model, reply: text.slice(0, 40) }
        : { ok: false, ms: Date.now() - t0, model, error: `HTTP ${r.status}: ${JSON.stringify(j?.error?.message ?? j).slice(0, 300)}` };
    } catch (e: any) {
      out.openai = { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 300) };
    }
  } else out.openai = { ok: false, error: "no OPENAI_API_KEY" };

  const healthy = Object.values(out).filter((p: any) => p.ok).length;
  const body = { healthy, of: 3, providers: out };
  if (sql) { try { await saveForgeResult(sql, CACHE_TICKET, null, JSON.stringify({ at: Date.now(), body })); } catch { /* best-effort */ } }
  return res.status(200).json({ ...body, cached: false });
}

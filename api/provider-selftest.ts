/**
 * GET /api/provider-selftest?key=<MODERATION_KEY>
 * Owner-only diagnostics: fires a tiny "say OK" request at every configured AI
 * provider and reports success, latency, and the EXACT error text on failure —
 * so "which provider is broken and why" is one URL, not a log hunt.
 * Admin-gated because each call costs a few real tokens.
 */
import Anthropic from "@anthropic-ai/sdk";

const T = 30_000;

export default async function handler(req: any, res: any) {
  const key = (req.headers["x-admin-key"] as string) || (req.query?.key as string) || "";
  if (!process.env.MODERATION_KEY || key !== process.env.MODERATION_KEY) {
    return res.status(401).json({ error: "admin key required (?key= or x-admin-key)" });
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
  return res.status(200).json({ healthy, of: 3, providers: out });
}

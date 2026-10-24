/**
 * GET /api/admin-keys — what is configured, what is missing, and how to fix it.
 * Auth: x-admin-key must equal MODERATION_KEY (same trust as the review queue).
 *
 * IT NEVER RETURNS A KEY. Not a value, not a prefix, not a suffix. Several
 * providers encode account information in the first characters of a key, and a
 * "safe" prefix is how a support screenshot becomes an incident. What it returns
 * is SET or MISSING, plus the first eight hex of a SHA-256 of the value — enough
 * to confirm a rotation actually took effect, impossible to reverse into a key.
 *
 * There is deliberately no POST. Writing keys through an HTTP endpoint would
 * move every credential the business owns out of Vercel's encrypted store and
 * into a database row, where a leak reaches them and where MODERATION_KEY alone
 * would be enough to take all of them. See api/_keyregistry.ts for the full
 * reasoning. This endpoint tells you what to set; the platform's secret store
 * remains the only place a secret lives.
 */
import { createHash } from "node:crypto";
import { KEYS, oneOfSets } from "./_keyregistry";
import { recordSecurityEvent } from "./_guard";
import { getDb } from "./_ledger";
import { clientIp } from "./_guard";

/** Irreversible, and short enough that it cannot be brute-forced back into a
 *  key of real entropy. Its only job is "is this the same value as before". */
function fingerprint(v: string): string {
  return createHash("sha256").update(v).digest("hex").slice(0, 8);
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const adminKey = process.env.MODERATION_KEY;
  if (!adminKey) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== adminKey) {
    /* A wrong admin key on the endpoint that enumerates the platform's
       credentials is worth recording even though it reveals none of them. */
    try {
      const sql = getDb();
      if (sql) await recordSecurityEvent(sql, "admin_keys_denied", "warn", { ip: clientIp(req) });
    } catch { /* the refusal matters more than its log line */ }
    return res.status(401).json({ error: "Invalid admin key" });
  }

  const keys = KEYS.map((k) => {
    const raw = process.env[k.env];
    const set = typeof raw === "string" && raw.trim().length > 0;
    return {
      env: k.env,
      group: k.group,
      need: k.need,
      powers: k.powers,
      without: k.without,
      oneOf: k.oneOf ?? null,
      set,
      /* Confirms WHICH value is in place across a rotation, without being one. */
      fingerprint: set ? fingerprint(raw as string) : null,
      /* Ready to paste. The value is typed at the prompt, never put in a URL,
         a request body or a shell history entry with the key inline. */
      howTo: `vercel env add ${k.env} production`,
    };
  });

  /* A one-of set is satisfied by any member: three AI providers are a fallback
     chain, and reporting all three as "required and missing" when one is set
     would send the owner shopping for keys the platform does not need. */
  const sets = Object.entries(oneOfSets()).map(([name, members]) => ({
    name,
    members,
    satisfied: members.some((m) => {
      const v = process.env[m];
      return typeof v === "string" && v.trim().length > 0;
    }),
  }));

  const unmet = keys.filter((k) => {
    if (k.set) return false;
    if (k.need !== "required" && k.need !== "recommended") return false;
    /* Inside a satisfied one-of set, a missing member is not a gap. */
    if (k.oneOf) return !sets.find((s) => s.name === k.oneOf)?.satisfied;
    return true;
  });

  const blocking = unmet.filter((k) => k.need === "required");

  return res.status(200).json({
    /* The headline an owner wants: can this platform take money and build a game. */
    ready: blocking.length === 0,
    summary: {
      total: keys.length,
      set: keys.filter((k) => k.set).length,
      blocking: blocking.length,
      recommended_missing: unmet.length - blocking.length,
      cosmetic: keys.filter((k) => k.need === "cosmetic").length,
    },
    blocking: blocking.map((k) => ({ env: k.env, without: k.without, howTo: k.howTo })),
    oneOfSets: sets,
    keys,
    note: "Values are never returned by this endpoint, and there is no way to set a key through it. "
        + "Keys live in the platform's secret store; the fingerprint is a one-way hash so you can confirm a rotation took effect.",
  });
}

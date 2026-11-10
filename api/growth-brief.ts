/**
 * /api/growth-brief — the Growth Brief desk (Trend Intelligence, §13).
 *
 *   GET  ?channel=seo[&market=&locale=&topic=]  → the EFFECTIVE brief, or 204
 *   GET  ?list=1[&limit=]                       → the brief archive, newest first
 *   POST { brief }                               → approve and freeze one brief
 *   POST { archive: { briefId, briefVersion } }  → withdraw one before expiry
 *
 * Auth: x-admin-key === MODERATION_KEY, or Vercel Cron's Authorization: Bearer
 * CRON_SECRET. Fail closed. A brief is not a public document: it carries the
 * objective, the audience, the approved claims and the claims that are
 * forbidden, which is competitive strategy and, in the prohibited list, legal
 * exposure.
 *
 * WHY THIS ENDPOINT DOES NOT GENERATE ANYTHING. The spec's pipeline is
 * observe → score → draft a brief → a human approves it. The observation and
 * scoring stages are not built (see STATUS.md), so this is the approval surface
 * only: a brief arrives already written, is validated against the closed
 * contract in shared/trend.ts, and is frozen. Nothing here invents a brief, and
 * nothing here publishes one — `api/blog-agent.ts` reads the effective brief and
 * treats it as data.
 *
 * WHY THE AGENT DOES NOT CALL THIS OVER HTTP. It resolves the brief in-process
 * through the same two functions this handler uses. A function calling its own
 * platform over HTTP is a second path to one answer, pays a cold start, and can
 * fail while the database is perfectly healthy.
 */
import { getDb, ensureBriefSchema, saveGrowthBrief, archiveGrowthBrief, effectiveBriefCandidates, listGrowthBriefs } from "./_ledger";
import { tooManyBadKeys } from "./_guard";
import {
  GrowthBriefSchema, BriefChannels, ENABLED_BRIEF_CHANNELS, briefRuntimeFailures,
  pickEffectiveBrief, INSTALL, INSTALLED_LOCALES,
  type BriefChannel,
} from "../shared/trend";
import { failing } from "./_observe";

/** A brief payload is a bounded object, not a document. 16 KiB is generous for
 *  22 fields and refuses a megabyte of jsonb before it reaches the parser. */
const MAX_BRIEF_BYTES = 16_384;

function authorised(req: any): boolean {
  const key = process.env.MODERATION_KEY;
  if (key && req.headers?.["x-admin-key"] === key) return true;
  const cron = process.env.CRON_SECRET;
  if (cron && req.headers?.["authorization"] === `Bearer ${cron}`) return true;
  return false;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.MODERATION_KEY;
  const cron = process.env.CRON_SECRET;
  if (!key && !cron) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (!authorised(req)) {
    if (await tooManyBadKeys(getDb(), req, res)) return;
    return res.status(401).json({ error: "Admin key or cron secret required" });
  }

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing — Growth Briefs need the database.", mode: "no_db" });

  try {
    await ensureBriefSchema(sql);

    if (req.method === "GET") {
      if (String(req.query?.list ?? "") === "1") {
        const limit = Number(req.query?.limit ?? 50);
        const rows = await listGrowthBriefs(sql, Number.isFinite(limit) ? limit : 50);
        return res.status(200).json({
          briefs: rows.map((r: any) => ({
            briefId: r.brief_id, briefVersion: Number(r.brief_version), market: r.market, locale: r.locale,
            topicId: r.topic_id, status: r.status, validFrom: r.valid_from, expiresAt: r.expires_at,
            objective: r.objective ?? null,
            opportunityScore: r.opportunity_score === null ? null : Number(r.opportunity_score),
            confidence: r.confidence === null ? null : Number(r.confidence),
            /* §17's read side: what this brief has actually steered. A brief in
               force all week with zero artefacts is the thing to notice. */
            artefacts: Number(r.artefacts ?? 0),
          })),
          count: rows.length,
          install: { tenantId: INSTALL.tenantId, platformId: INSTALL.platformId, market: INSTALL.market, locale: INSTALL.locale },
        });
      }

      /* THE EFFECTIVE LOOKUP. A channel is required, because "which brief
         applies" has no answer without one — allowed_channels is part of what
         makes a brief applicable. */
      const channel = String(req.query?.channel ?? "");
      if (!(BriefChannels as readonly string[]).includes(channel)) {
        return res.status(400).json({ error: `channel must be one of: ${BriefChannels.join(", ")}` });
      }
      if (!ENABLED_BRIEF_CHANNELS.includes(channel as BriefChannel)) {
        return res.status(400).json({
          error: `channel ${channel} has no adapter in this release`,
          enabledChannels: ENABLED_BRIEF_CHANNELS,
        });
      }
      const market = String(req.query?.market ?? INSTALL.market).toUpperCase();
      const locale = String(req.query?.locale ?? INSTALL.locale);
      const topicRaw = String(req.query?.topic ?? "").trim();
      /* A topic id is an id, not free text — the traversal and injection probes
         in tests/t10 arrive here, and the only safe answer to "../../etc/passwd"
         is that it is not an id. */
      if (topicRaw && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(topicRaw)) {
        return res.status(400).json({ error: "topic must be 1-128 chars of [A-Za-z0-9_-] starting alphanumeric" });
      }
      if (!/^[A-Z]{2}$/.test(market)) return res.status(400).json({ error: "market must be an ISO alpha-2 code, or ZZ for global" });

      const candidates = await effectiveBriefCandidates(sql, { market, locale, topicId: topicRaw || null });
      const { brief, rejected } = pickEffectiveBrief(candidates, {
        channel: channel as BriefChannel, market, locales: [locale],
      });

      /* §12: "204 when effective brief has no eligible match". No brief is a
         normal, expected answer — the consumer falls back to its baseline
         behaviour — so it is not an error and carries no body. The reasons go to
         the log, which is where the operator asking "why did nothing apply"
         will look. */
      if (!brief) {
        console.log(JSON.stringify({
          effectiveBrief: { result: "none", channel, market, locale, topic: topicRaw || null, candidates: candidates.length, rejected },
        }));
        return res.status(204).end();
      }
      return res.status(200).json({
        brief,
        briefVersion: brief.brief_version,
        expiresAt: brief.expires_at,
        /* §14: the SDK may cache within a 60-second ceiling and never beyond
           expiry. Stated here so a consumer does not have to know the rule. */
        cacheSeconds: Math.max(0, Math.min(60, Math.floor((Date.parse(brief.expires_at) - Date.now()) / 1000))),
        rejected,
      });
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body !== "object" || Array.isArray(body)) return res.status(422).json({ error: "body must be a JSON object" });

      /* WITHDRAW. Without this a brief that should never have been approved
         steers every post until it expires, and expiry is up to seven days. */
      const arch = body.archive as { briefId?: unknown; briefVersion?: unknown } | undefined;
      if (arch && typeof arch === "object" && !Array.isArray(arch)) {
        const id = typeof arch.briefId === "string" ? arch.briefId : "";
        const ver = Number(arch.briefVersion);
        if (!id || !Number.isInteger(ver) || ver < 1) return res.status(422).json({ error: "archive requires { briefId, briefVersion }" });
        const done = await archiveGrowthBrief(sql, id, ver);
        if (!done) return res.status(404).json({ error: "No approved brief by that id and version" });
        console.log(JSON.stringify({ growthBrief: { action: "archived", briefId: id, briefVersion: ver } }));
        return res.status(200).json({ ok: true, briefId: id, briefVersion: ver, status: "archived" });
      }

      const raw = body.brief;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return res.status(422).json({ error: "brief must be a JSON object" });
      if (JSON.stringify(raw).length > MAX_BRIEF_BYTES) {
        return res.status(422).json({ error: `brief exceeds ${MAX_BRIEF_BYTES} bytes — a Growth Brief is 22 fields, not a document` });
      }

      /* THE CONTRACT IS THE GATE. .strict() means an unexpected field is a
         rejection, not ignored data, so a producer that has drifted from v1
         fails here rather than halfway through a blog post. */
      const parsed = GrowthBriefSchema.safeParse(raw);
      if (!parsed.success) {
        return res.status(422).json({
          error: "brief does not satisfy Growth Brief v1",
          issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
        });
      }
      const brief = parsed.data;

      /* §17: expiry is checked on every lookup AND every write. Approving a
         brief that is already expired, or bound to another installation, stores
         something that can never apply — which looks like success and is not. */
      const failures = briefRuntimeFailures(brief, {
        locales: INSTALLED_LOCALES, tenantId: INSTALL.tenantId, platformId: INSTALL.platformId,
      });
      if (failures.length) return res.status(422).json({ error: "brief is not usable by this installation", failures });

      const outcome = await saveGrowthBrief(sql, {
        briefId: brief.brief_id, briefVersion: brief.brief_version,
        tenantId: brief.tenant_id, platformId: brief.platform_id,
        market: brief.market, locale: brief.locale, topicId: brief.topic_id,
        validFrom: brief.valid_from, expiresAt: brief.expires_at, payload: brief,
      });
      if (outcome === "conflict") {
        return res.status(409).json({
          error: `${brief.brief_id} v${brief.brief_version} already exists with different content. A frozen version is never replaced — approve a new brief_version instead.`,
        });
      }
      console.log(JSON.stringify({
        growthBrief: {
          action: outcome, briefId: brief.brief_id, briefVersion: brief.brief_version,
          topicId: brief.topic_id, market: brief.market, locale: brief.locale, expiresAt: brief.expires_at,
        },
      }));
      return res.status(outcome === "created" ? 201 : 200).json({
        ok: true, result: outcome, briefId: brief.brief_id, briefVersion: brief.brief_version, expiresAt: brief.expires_at,
      });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err: any) {
    return failing(res, "growth.brief", err, "Growth Brief desk failed");
  }
}

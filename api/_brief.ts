/**
 * THE ONE PLACE A GROWTH BRIEF IS RESOLVED, APPLIED AND RECORDED.
 *
 * Justin: "everything attached must be embedded onto the whole existing
 * platform, not a separate one" and "nothing to be visible to users — it needs
 * to work invisible."
 *
 * Both of those are architectural instructions, not cosmetic ones.
 *
 * EMBEDDED means every surface that produces outward-facing content asks the
 * same question through the same function. The first version of this lived
 * inside api/blog-agent.ts, which made the blog the only steered surface and
 * guaranteed that the second one would be a copy — the failure this repository
 * has paid for more than any other. So resolution, the model-facing directive,
 * the deterministic steering used by surfaces that call no model, and the
 * attribution record all live here, and the agents call in.
 *
 * INVISIBLE means nothing here reaches a public response, a rendered page, a
 * sitemap, a feed or any marketing copy. A brief changes what an agent is told;
 * it never becomes something a creator reads. tests/t47 asserts that as a
 * property of the repository rather than trusting this paragraph.
 *
 * WHAT IS DELIBERATELY NOT STEERED, and this is a boundary rather than an
 * omission:
 *
 *   The forge (api/_gateway.ts, _forgejobs.ts, forge-enhance.ts). A creator has
 *   paid ACUs for the game they described. Letting the platform's own marketing
 *   objective influence what that build becomes would be spending someone
 *   else's money on our growth, and no brief is worth that.
 *
 *   Transactional mail (api/comms.ts, _notify.ts). A receipt, a payout notice
 *   or a password mail must say the same thing on every day of every campaign.
 *
 *   The security agent and the SEO structure helpers, which call no model and
 *   produce no persuasive copy.
 */
import {
  pickEffectiveBrief, briefRuntimeFailures, INSTALL, INSTALLED_LOCALES,
  ENABLED_BRIEF_CHANNELS, type BriefChannel, type GrowthBrief,
} from "../shared/trend";
import { ensureBriefSchema, effectiveBriefCandidates, recordBriefUse } from "./_ledger";

/** Where a brief may apply. One entry per adapter that actually exists. */
export type BriefSurface = "blog" | "newsletter";

export type BriefResolution = {
  brief: GrowthBrief | null;
  /** Always populated — "baseline" is an answer and needs a reason, not silence. */
  why: string;
};

/**
 * §14.5 — resolve the effective brief for one channel, or report baseline.
 *
 * The spec's failure rule is explicit: "on timeout, disabled entitlement,
 * missing capability or no approved brief, use host baseline behaviour." Every
 * path out of here that is not a valid brief therefore returns null, and the
 * caller carries on exactly as it did before Trend Intelligence existed. A
 * content pipeline that stops publishing because a strategy lookup failed has
 * traded a working feature for a new one.
 *
 * No cache. The spec permits 60 seconds and forbids ever treating a cache as
 * authority to publish; these callers run on daily and weekly crons, so a cache
 * would save one query a week and introduce exactly the bug the rule exists to
 * prevent (TI-05: acting on a brief that has since expired).
 */
export async function resolveBrief(sql: any, channel: BriefChannel): Promise<BriefResolution> {
  if (!sql) return { brief: null, why: "baseline — no database" };
  if (!ENABLED_BRIEF_CHANNELS.includes(channel)) {
    return { brief: null, why: `baseline — channel ${channel} has no adapter in this release` };
  }
  try {
    await ensureBriefSchema(sql);
    const candidates = await effectiveBriefCandidates(sql, { market: INSTALL.market, locale: INSTALL.locale });
    const { brief, rejected } = pickEffectiveBrief(candidates, { channel });
    if (brief) return { brief, why: `${brief.brief_id} v${brief.brief_version}` };
    return {
      brief: null,
      why: candidates.length
        ? `baseline — ${candidates.length} candidate(s), none eligible for ${channel}: ${rejected.map((r) => `${r.briefId}: ${r.reasons[0]}`).join("; ").slice(0, 300)}`
        : "baseline — no approved brief in window",
    };
  } catch (err: any) {
    return { brief: null, why: `baseline — brief lookup failed: ${String(err?.message ?? err).slice(0, 160)}` };
  }
}

/**
 * The brief, rendered for a model AS DATA.
 *
 * §7 and §14: "pass the returned brief and claims as data alongside the existing
 * agent instructions… do not rewrite agent prompts permanently." Every caller
 * appends this to the user message; no caller edits its system prompt. A system
 * prompt a strategy engine rewrites is a system prompt nobody can reason about,
 * and the honesty rules that must survive every brief live in those prompts.
 *
 * PROHIBITED CLAIMS ARE PASSED, NOT ENFORCED, and the difference matters. Real
 * enforcement needs §10's approved-claim registry and asset binding, which does
 * not exist here; matching free-text phrases as substrings would look like a
 * gate and catch nothing. The honesty rules that ARE enforced are the ones in
 * the agents' own prompts and in api/_seoscore.ts.
 */
export function briefDirective(b: GrowthBrief): string {
  return [
    `APPROVED GROWTH BRIEF ${b.brief_id} v${b.brief_version} — steering data, not a replacement for the rules above.`,
    `  Objective: ${b.objective}`,
    `  Audience: ${b.audience}`,
    `  Search intent to serve: ${b.intent}`,
    `  Market and locale: ${b.market} / ${b.locale}`,
    b.prohibited_claims.length
      ? `  Do NOT make any of these claims, in any wording:\n${b.prohibited_claims.map((c) => `    - ${c}`).join("\n")}`
      : `  No claim restrictions beyond the hard rules above.`,
    `Write the assigned subject FOR THAT AUDIENCE and TOWARD THAT OBJECTIVE. Where the brief and the rules above disagree, the rules above win.`,
  ].join("\n");
}

/**
 * STEERING A SURFACE THAT CALLS NO MODEL.
 *
 * The newsletter is assembled deterministically from api/_features.ts, so there
 * is no prompt to append a directive to. Being "embedded on the whole platform"
 * cannot mean "only the surfaces that happen to use a model", so the brief
 * steers it the only honest way available: it reorders what already exists.
 *
 * Relevance is keyword overlap between the brief's own audience and intent text
 * and each item's declared keywords. Nothing is invented, nothing is scored by a
 * model, and an item that matches nothing keeps its original position — so with
 * a brief that matches nothing the order is unchanged rather than scrambled.
 *
 * Stable by construction: equal scores preserve input order, which is what keeps
 * the newsletter's week rotation intact underneath the steering.
 */
export function steerByBrief<T extends { keywords?: string[]; name?: string }>(
  items: readonly T[], brief: GrowthBrief | null,
): T[] {
  if (!brief) return [...items];
  const terms = new Set(
    `${brief.audience} ${brief.intent} ${brief.objective}`
      .toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  if (!terms.size) return [...items];
  const score = (it: T): number => {
    const hay = `${(it.keywords ?? []).join(" ")} ${it.name ?? ""}`.toLowerCase();
    const words = new Set(hay.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    let n = 0;
    for (const t of terms) if (words.has(t)) n++;
    return n;
  };
  return items
    .map((it, i) => ({ it, i, s: score(it) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.it);
}

/**
 * §17 "measure and adapt" — record WHICH brief produced WHICH artefact.
 *
 * On the artefact, never on the reader. A brief steers what gets written; it
 * says nothing about any individual, so attributing it to a person's session
 * would be both wrong and a privacy problem invented for no gain. One row per
 * artefact means "how did everything written under brief X perform" is a join
 * away, and it is recorded for baseline too — an experiment with no record of
 * its control is not an experiment.
 *
 * Never allowed to break the thing it measures: a failed write is logged and
 * swallowed, because losing a bookkeeping row is cheaper than losing the post.
 */
export async function attributeBrief(
  sql: any,
  a: { surface: BriefSurface; artefactId: string; channel: BriefChannel; brief: GrowthBrief | null; resolution: string },
): Promise<void> {
  console.log(JSON.stringify({
    briefApplied: {
      surface: a.surface, artefact: a.artefactId, channel: a.channel,
      brief: a.brief ? `${a.brief.brief_id} v${a.brief.brief_version}` : null, resolution: a.resolution,
    },
  }));
  if (!sql) return;
  try {
    await recordBriefUse(sql, {
      surface: a.surface, artefactId: a.artefactId, channel: a.channel,
      briefId: a.brief?.brief_id ?? null, briefVersion: a.brief?.brief_version ?? null,
    });
  } catch (err: any) {
    console.log(JSON.stringify({ briefAttributionFailed: { surface: a.surface, artefact: a.artefactId, error: String(err?.message ?? err).slice(0, 120) } }));
  }
}

/** Re-check a brief at the moment of use. §17: expiry is checked on every
 *  lookup and every write, so a caller that held a brief across a long
 *  generation loop can confirm it is still valid before it publishes. */
export function stillValid(brief: GrowthBrief, channel: BriefChannel): string[] {
  return briefRuntimeFailures(brief, {
    channel, locales: INSTALLED_LOCALES, tenantId: INSTALL.tenantId, platformId: INSTALL.platformId,
  });
}

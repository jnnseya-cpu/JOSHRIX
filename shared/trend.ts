/**
 * TREND INTELLIGENCE — the Growth Brief contract and the scoring it comes from.
 *
 * WHAT THIS IS. Trend_Intelligence_AI_Build_Spec v2.3 specifies a control layer
 * that reads demand signals, scores whether this platform can serve them, and
 * issues a versioned Growth Brief that retargets the SEO and marketing agents
 * already running here. Justin's instruction on 10 Nov was to MERGE it rather
 * than stand up the separate Python service the spec's §12 proposes.
 *
 * WHY MERGED AND NOT A SECOND SERVICE. The spec's reference stack is Python,
 * FastAPI, SQLAlchemy and a React console. JOSHRIX is TypeScript on Vercel with
 * Neon, and this session removed two parallel backends precisely because a
 * second deployable system that can act on the platform's behalf is a hazard
 * rather than an architecture. So the capability is built here, in this stack,
 * against the spec's contracts — which is what makes it portable later if it is
 * ever extracted.
 *
 * WHAT IS IN THIS FILE, AND WHY ONLY THIS. Pure contract and pure arithmetic.
 * No database, no HTTP, no model call. That is deliberate: §5's scoring and §6's
 * contract are the only parts of this spec that can be PROVEN in an environment
 * with no keys, no deployment and no traffic, because they are deterministic.
 * tests/t47 reproduces the spec's own worked example — 86.25 opportunity and
 * 83.5 confidence from its stated inputs — so conformance is measured rather
 * than asserted.
 *
 * THE ONE THING TO UNDERSTAND BEFORE USING IT. §5 caps confidence at 69 when a
 * single source family contributes, and a brief needs 75. So an installation
 * with one instrumented signal stream is permanently draft-only BY ARITHMETIC,
 * not by policy. That is not a defect in the spec, it is a precondition the
 * spec states indirectly and §22 confirms: a keyless deployment needs at least
 * two INDEPENDENT first-party families. For JOSHRIX those are available —
 * internal search and play events are independent of completed purchases — but
 * a new platform with no traffic has nothing to detect, and that must stay
 * visible rather than be rounded away.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * §6 / Appendix A — the Growth Brief, as a closed object.
 *
 * The spec is explicit that agents must treat this as closed and that adding a
 * field requires a new schema version. `.strict()` is what makes that real: an
 * unexpected key is a validation error rather than silently ignored data, which
 * is the failure mode a versioned contract exists to prevent.
 * ------------------------------------------------------------------ */
export const BriefChannels = [
  "seo", "organic_social", "sales_enablement", "owned_placement", "lifecycle", "paid",
] as const;
export type BriefChannel = (typeof BriefChannels)[number];

/** Which channels actually have an adapter. The enum above reserves stable
 *  routing values; the spec is clear that listing one "makes no feature
 *  available on its own", so availability lives here and not in the schema. */
export const ENABLED_BRIEF_CHANNELS: readonly BriefChannel[] = ["seo", "organic_social"];

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const Id = z.string().regex(idPattern, "id must be 1-128 chars of [A-Za-z0-9_-] starting alphanumeric");
const Score = z.number().min(0).max(100);
/** The spec requires a trailing Z: a brief with a local-offset timestamp is a
 *  brief whose expiry means different things in different processes. */
const Utc = z.string().datetime({ offset: false }).regex(/Z$/, "timestamp must be UTC with a trailing Z");
const ShortText = z.string().min(1).max(500);
const IdList = z.array(Id).max(64).refine((a) => new Set(a).size === a.length, "ids must be unique");

export const GrowthBriefSchema = z.object({
  schema_version: z.literal(1),
  brief_id: Id,
  brief_version: z.number().int().min(1),
  tenant_id: Id,
  platform_id: Id,
  /** ISO alpha-2, with ZZ reserved for explicitly global briefs. */
  market: z.string().regex(/^[A-Z]{2}$/),
  locale: z.string().min(2).max(35),
  topic_id: Id,
  opportunity_score: Score,
  confidence: Score,
  valid_from: Utc,
  expires_at: Utc,
  /** At least one: a brief with no evidence is an opinion. */
  evidence_ids: IdList.min(1),
  audience: ShortText,
  intent: ShortText,
  approved_claim_ids: IdList,
  cta_id: Id,
  allowed_channels: z.array(z.enum(BriefChannels)).min(1).max(6)
    .refine((a) => new Set(a).size === a.length, "channels must be unique"),
  prohibited_claims: z.array(ShortText).max(32)
    .refine((a) => new Set(a).size === a.length, "prohibited claims must be unique"),
  objective: ShortText,
  experiment_id: Id,
  policy_version: z.number().int().min(1),
}).strict();

export type GrowthBrief = z.infer<typeof GrowthBriefSchema>;

/**
 * §Appendix A — "a schema-valid object can still fail these checks".
 *
 * The runtime rules are separate from the schema on purpose, because they
 * depend on the clock and on the installation. Returning a list of reasons
 * rather than a boolean matters: "this brief is not usable" is not actionable,
 * and the reason is what an operator needs in a log line.
 */
export function briefRuntimeFailures(
  brief: GrowthBrief,
  opts: { now?: Date; channel?: BriefChannel; locales?: readonly string[]; market?: string } = {},
): string[] {
  const out: string[] = [];
  const now = opts.now ?? new Date();
  const from = Date.parse(brief.valid_from);
  const until = Date.parse(brief.expires_at);

  if (!(from < until)) out.push("valid_from must be strictly before expires_at");
  if (now.getTime() < from) out.push("brief is not yet valid");
  /* Expiry is checked on every lookup and every write, per §17. A cached brief
     that has expired is the TI-05 case and must never authorise anything. */
  if (now.getTime() >= until) out.push("brief has expired");

  if (opts.channel && !brief.allowed_channels.includes(opts.channel)) {
    out.push(`channel ${opts.channel} is not in this brief's allowed channels`);
  }
  /* A channel in the enum without an adapter is not a usable route. */
  const unavailable = brief.allowed_channels.filter((c) => !ENABLED_BRIEF_CHANNELS.includes(c));
  if (opts.channel && unavailable.includes(opts.channel)) {
    out.push(`channel ${opts.channel} has no adapter in this release`);
  }
  if (opts.locales && opts.locales.length && !opts.locales.includes(brief.locale)) {
    out.push(`locale ${brief.locale} is not in the installed locale set`);
  }
  /* ZZ never matches a country-targeted lookup by default, per §16. */
  if (opts.market && brief.market !== opts.market && brief.market !== "ZZ") {
    out.push(`brief market ${brief.market} does not match requested ${opts.market}`);
  }
  if (opts.market && brief.market === "ZZ" && opts.market !== "ZZ") {
    out.push("a global (ZZ) brief does not satisfy a country-targeted lookup");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * §5 — detection arithmetic. Deterministic, and therefore testable here.
 * ------------------------------------------------------------------ */

const median = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** §5.3 log lift: ln((c+1)/(b+1)). The +1 is what keeps a zero baseline finite
 *  instead of producing an infinite "trend" from one observation. */
export function logLift(current: number, baselineMedian: number): number {
  return Math.log((current + 1) / (baselineMedian + 1));
}

/**
 * §5.3 robust anomaly score. MAD rather than standard deviation because one
 * campaign spike in the history would inflate a standard deviation and hide
 * every later move; the 0.2 floor stops a flat history dividing by ~zero and
 * reporting an enormous z from noise.
 */
export function robustZ(current: number, history: readonly number[]): number {
  const l1p = (n: number) => Math.log1p(Math.max(0, n));
  const logs = history.map(l1p);
  const mu = median(logs);
  const mad = median(logs.map((v) => Math.abs(v - mu)));
  return (l1p(current) - mu) / Math.max(1.4826 * mad, 0.2);
}

/** §5.3 count-feed gate. Adjustable per source and geography, as the spec says,
 *  so the defaults live here and callers may override. */
export const COUNT_GATE = { minCount: 20, minZ: 2 } as const;

/** §17 reference mapping for count feeds: clamp(50 + 10z, 0, 100). */
export function demandFromZ(z: number): number {
  return Math.min(100, Math.max(0, 50 + 10 * z));
}

/** §5.4 weights. Named so a change shows up in a diff as a decision. */
export const OPPORTUNITY_WEIGHTS = { demand: 0.25, fit: 0.25, intent: 0.20, timing: 0.15, readiness: 0.15 } as const;
/** §5.5 weights. */
export const CONFIDENCE_WEIGHTS = { sourceQuality: 0.35, corroboration: 0.25, coverage: 0.20, freshness: 0.20 } as const;

export type OpportunityInputs = {
  demand: number; fit: number; intent: number; timing: number; readiness: number;
};

/**
 * §5.4. Readiness of zero is a VETO, not a low score: the spec says missing
 * readiness blocks activation, and averaging it away would let a topic with no
 * stock, no approved claim and no available target still reach a brief.
 */
export function opportunityScore(i: OpportunityInputs): { score: number; vetoed: boolean } {
  const w = OPPORTUNITY_WEIGHTS;
  const score = i.demand * w.demand + i.fit * w.fit + i.intent * w.intent
    + i.timing * w.timing + i.readiness * w.readiness;
  return { score, vetoed: i.readiness <= 0 };
}

/** §5.5 / §17: 0 for one independent family, 80 for two, 100 for three or more. */
export function corroborationScore(independentFamilies: number): number {
  if (independentFamilies >= 3) return 100;
  if (independentFamilies === 2) return 80;
  return 0;
}

export type ConfidenceInputs = {
  sourceQuality: number; coverage: number; freshness: number; independentFamilies: number;
};

/**
 * §5.5. The single-family cap is the load-bearing rule in this whole spec and
 * the easiest to lose in a refactor: with one source family, confidence can
 * never reach the 75 a brief requires, so a one-stream installation is
 * draft-only by arithmetic. Returning `cappedBySingleFamily` means an operator
 * sees WHY a topic will not progress rather than watching a number sit at 69.
 */
export const SINGLE_FAMILY_CONFIDENCE_CAP = 69;

export function confidenceScore(i: ConfidenceInputs): { score: number; cappedBySingleFamily: boolean } {
  const w = CONFIDENCE_WEIGHTS;
  const raw = i.sourceQuality * w.sourceQuality
    + corroborationScore(i.independentFamilies) * w.corroboration
    + i.coverage * w.coverage
    + i.freshness * w.freshness;
  if (i.independentFamilies <= 1 && raw > SINGLE_FAMILY_CONFIDENCE_CAP) {
    return { score: SINGLE_FAMILY_CONFIDENCE_CAP, cappedBySingleFamily: true };
  }
  return { score: raw, cappedBySingleFamily: false };
}

/* §5 decision table. */
export type TrendDisposition = "archive" | "watch" | "brief" | "auto_eligible";

export const DISPOSITION_GATES = {
  archive: { score: 60, confidence: 55 },
  brief: { score: 75, confidence: 75 },
  auto: { score: 85, confidence: 85 },
} as const;

/**
 * §5 table, in order. `autoOptIn` defaults to false because the spec allows a
 * bounded automatic tier only on explicit tenant opt-in and only for approved
 * low-risk classes — a default of true would be the platform granting itself
 * permission to act.
 */
export function disposition(
  score: number, confidence: number,
  opts: { vetoed?: boolean; autoOptIn?: boolean } = {},
): { disposition: TrendDisposition; reason: string } {
  const g = DISPOSITION_GATES;
  if (opts.vetoed) return { disposition: "archive", reason: "hard veto: readiness, claims or targeting" };
  if (score < g.archive.score || confidence < g.archive.confidence) {
    return { disposition: "archive", reason: `below archive cutoff (score ${g.archive.score}, confidence ${g.archive.confidence})` };
  }
  if (score >= g.auto.score && confidence >= g.auto.confidence && opts.autoOptIn) {
    return { disposition: "auto_eligible", reason: "above the automatic tier and the tenant has opted in" };
  }
  if (score >= g.brief.score && confidence >= g.brief.confidence) {
    return { disposition: "brief", reason: "eligible for a reviewable brief; external action still needs approval" };
  }
  return { disposition: "watch", reason: "between cutoffs — watch or draft internally, no live change" };
}

/**
 * §5.3: "With fewer than four comparable periods, label insufficient history
 * and keep draft-only." Separate from scoring so the caller reports it rather
 * than silently producing a number from two data points.
 */
export const MIN_COMPARABLE_PERIODS = 4;
export function hasEnoughHistory(comparablePeriods: number): boolean {
  return comparablePeriods >= MIN_COMPARABLE_PERIODS;
}

/**
 * JOSHRIX Forge Graph — telemetry event contract.
 * The data flywheel moat (docs/DEEP-DIVE.md §4.1): every prompt, forge decision,
 * play session, share, and sale — linked. This schema is the day-one capture
 * contract; the moat only accrues if collection starts with the first user.
 * Events carry no key material and no raw personal data beyond the ids listed.
 */
import { z } from "zod";

export const ForgeGraphEvents = [
  // creation chain
  "forge.prompt_submitted",
  "forge.blueprint_generated",
  "forge.blueprint_approved",
  "forge.refine_started",
  "forge.agent_completed",
  "forge.qa_certified",
  "forge.playtest_started",
  "forge.published",
  // play chain
  "play.session_start",
  "play.session_end",
  "play.level_up",
  "play.round_completed",
  // distribution chain
  "share.link_copied",
  "share.forge_chip_clicked",
  "share.embed_loaded",
  // commerce chain
  "market.listing_viewed",
  "market.purchase",
  "remix.forked",
  "payout.first_payout",
] as const;
export type ForgeGraphEvent = (typeof ForgeGraphEvents)[number];

export const TelemetryEventSchema = z.object({
  event: z.enum(ForgeGraphEvents),
  /** Unix ms, stamped by the client; the collector re-stamps receivedAt server-side. */
  ts: z.number().int().nonnegative(),
  /** Anonymous per-tab session id (not an auth token). */
  sessionId: z.string().min(6).max(64),
  userId: z.string().max(64).optional(),
  gameId: z.string().max(64).optional(),
  /** BCP-47 creation/play language — powers the language-conquest analytics. */
  language: z.string().max(16).optional(),
  /** Event-specific payload: scores, ACU spend, level, provider, price, lineage ids… */
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const TelemetryBatchSchema = z.object({
  events: z.array(TelemetryEventSchema).min(1).max(500),
});
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;

/** Remix Graph lineage — every fork records its ancestry; ancestors earn forever. */
export const RemixLineageSchema = z.object({
  gameId: z.string(),
  parentGameId: z.string(),
  /** Fraction of descendant net revenue owed to the ancestor chain (v1 fixed). */
  ancestorRoyaltyShare: z.number().min(0).max(0.5),
  ipCertificateId: z.string(),
  forkedAt: z.number().int(),
});
export type RemixLineage = z.infer<typeof RemixLineageSchema>;

/** v1 Remix Graph constants — see docs/DEEP-DIVE.md §4.2 */
export const REMIX = {
  ancestorRoyaltyShare: 0.3, // 70/30: forker keeps 70% of the creator side, ancestor chain earns 30%
  maxLineageDepth: 5,        // royalties decay along at most 5 ancestor hops
} as const;

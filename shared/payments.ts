/**
 * JOSHRIX payment structure — pay-in and pay-out contracts + split mathematics.
 * Single source of truth for money. All amounts are INTEGER MINOR UNITS (pence).
 * Rules mirror docs/MONETISATION.md; the ledger is double-entry (postings sum to
 * zero per transaction) and must live in Postgres in production — never solely
 * in Firestore (APP-BUILD-SPEC rule).
 */
import { z } from "zod";
import { REMIX } from "./telemetry";

export const CURRENCY = "GBP" as const;

/* ---------------- pay-in: ACU top-up packages (MONETISATION §Top-Up) -------- */
export const TOPUP_PACKAGES = [
  { id: "acu_5", priceMinor: 500, acu: 500 },
  { id: "acu_10", priceMinor: 1_000, acu: 1_000 },
  { id: "acu_25", priceMinor: 2_500, acu: 2_500 },
  { id: "acu_50", priceMinor: 5_000, acu: 5_000 },
  { id: "acu_100", priceMinor: 10_000, acu: 10_000 },
  { id: "acu_250", priceMinor: 25_000, acu: 25_000 },
  { id: "acu_500", priceMinor: 50_000, acu: 50_000 },
  { id: "acu_1000", priceMinor: 100_000, acu: 100_000 },
] as const;
export type TopupPackageId = (typeof TOPUP_PACKAGES)[number]["id"];

/* ---------------- pay-in: subscription plans (MONETISATION §Plans) ---------- */
export const PLANS = [
  { id: "explorer", name: "Explorer", monthlyMinor: 0, monthlyAcu: 0, commission: null }, // browse & play only — NO free AI, cannot sell
  { id: "creator", name: "Creator", monthlyMinor: 1_900, monthlyAcu: 380, commission: 0.25 },
  { id: "creator_pro", name: "Creator Pro", monthlyMinor: 4_900, monthlyAcu: 980, commission: 0.2 },
  { id: "studio", name: "Studio", monthlyMinor: 14_900, monthlyAcu: 2_980, commission: 0.15 },
  { id: "business", name: "Business", monthlyMinor: 39_900, monthlyAcu: 7_980, commission: 0.1 },
  { id: "enterprise", name: "Enterprise", monthlyMinor: 120_000, monthlyAcu: 24_000, commission: 0.075 }, // negotiated 5–10%
] as const;
export type PlanId = (typeof PLANS)[number]["id"];

export const PaymentMethods = ["card", "bitripay", "mobile_money"] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

/* ---------------- pay-out: rails and rules ---------------------------------- */
export const PAYOUT = {
  minMinor: 1_000,               // £10 minimum withdrawal
  kycThresholdMinor: 10_000,     // KYC required once cumulative payouts exceed £100
  scheduleDays: 7,               // free weekly settlement run
  rails: {
    bank_transfer: { feeRate: 0, feeFloorMinor: 0, etaDays: 7, instant: { feeRate: 0.01, feeFloorMinor: 30, etaDays: 0 } },
    bitripay: { feeRate: 0.005, feeFloorMinor: 20, etaDays: 1 },
    mobile_money: { feeRate: 0.015, feeFloorMinor: 25, etaDays: 1 },
  },
} as const;
export type PayoutRail = keyof typeof PAYOUT.rails;

/* ---------------- ledger: double-entry contract ----------------------------- */
export const LedgerAccounts = [
  "gateway_clearing",       // money at the processor, not yet settled
  "deferred_acu_revenue",   // liability: ACUs sold but not yet consumed
  "platform_revenue",       // recognised platform income (commissions, fees)
  "provider_cogs",          // AI provider costs attributed to consumption
  "creator_earnings",       // liability: what we owe creators
  "lineage_royalties",      // liability: what we owe remix ancestors
  "escrow",                 // exclusive-sale escrow holdings
  "payout_processing",      // payouts in flight to rails
] as const;
export type LedgerAccount = (typeof LedgerAccounts)[number];

export const LedgerPostingSchema = z.object({
  account: z.enum(LedgerAccounts),
  /** signed minor units; all postings in a tx MUST sum to zero */
  deltaMinor: z.number().int(),
});
export const LedgerTxSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["acu_topup", "subscription", "marketplace_sale", "in_game_purchase", "acu_consumption", "payout", "refund"]),
    ts: z.number().int(),
    currency: z.literal(CURRENCY),
    postings: z.array(LedgerPostingSchema).min(2),
    refs: z.record(z.string()).optional(), // gameId, listingId, userId, gatewayRef…
  })
  .refine((tx) => tx.postings.reduce((s, p) => s + p.deltaMinor, 0) === 0, {
    message: "Ledger postings must sum to zero (double-entry)",
  });
export type LedgerTx = z.infer<typeof LedgerTxSchema>;

/* ---------------- pay-in request schemas ------------------------------------ */
export const TopupRequestSchema = z.object({
  packageId: z.enum(TOPUP_PACKAGES.map((p) => p.id) as [TopupPackageId, ...TopupPackageId[]]),
  method: z.enum(PaymentMethods),
  /** server-side wallet to credit on webhook settlement (rides Stripe metadata) */
  walletId: z.string().max(80).optional(),
});
export const CheckoutRequestSchema = z.object({
  listingId: z.string().min(1),
  priceMinor: z.number().int().positive().max(10_000_000),
  method: z.enum(PaymentMethods),
  /** seller's plan decides commission; defaults to creator_pro (20%) in demo */
  sellerPlan: z.enum(PLANS.map((p) => p.id) as [PlanId, ...PlanId[]]).optional(),
  /** set when the listing is a remix — ancestors earn REMIX.ancestorRoyaltyShare of the creator side */
  hasLineage: z.boolean().optional(),
});
export const PayoutRequestSchema = z.object({
  amountMinor: z.number().int().positive(),
  rail: z.enum(Object.keys(PAYOUT.rails) as [PayoutRail, ...PayoutRail[]]),
  instant: z.boolean().optional(), // bank_transfer only
  destinationRef: z.string().min(3).max(120), // tokenised destination, never raw account data
});

/* ---------------- split mathematics (pure, tested) -------------------------- */
export function processorFeeMinor(method: PaymentMethod, grossMinor: number): number {
  // v1 indicative processor pricing; production reads live gateway rate cards
  const rates: Record<PaymentMethod, { rate: number; fixedMinor: number }> = {
    card: { rate: 0.014, fixedMinor: 20 },        // 1.4% + 20p (UK card)
    bitripay: { rate: 0.01, fixedMinor: 0 },      // 1%
    mobile_money: { rate: 0.02, fixedMinor: 0 },  // 2%
  };
  const r = rates[method];
  return Math.round(grossMinor * r.rate) + r.fixedMinor;
}

/** Marketplace sale: commission on gross (MONETISATION: £100 × 20% → £20/£80);
 *  processing deducted separately from the creator side; lineage royalty is
 *  REMIX.ancestorRoyaltyShare of the creator's NET (DEEP-DIVE §4.2). */
export function marketplaceSplit(opts: {
  grossMinor: number;
  method: PaymentMethod;
  sellerPlan?: PlanId;
  hasLineage?: boolean;
}) {
  const plan = PLANS.find((p) => p.id === (opts.sellerPlan ?? "creator_pro"))!;
  if (plan.commission === null) throw new Error("This plan cannot sell on the marketplace");
  const commissionMinor = Math.round(opts.grossMinor * plan.commission);
  const processingMinor = processorFeeMinor(opts.method, opts.grossMinor);
  const creatorNetBeforeLineage = opts.grossMinor - commissionMinor - processingMinor;
  const lineageMinor = opts.hasLineage ? Math.round(creatorNetBeforeLineage * REMIX.ancestorRoyaltyShare) : 0;
  const creatorMinor = creatorNetBeforeLineage - lineageMinor;
  return { grossMinor: opts.grossMinor, commissionMinor, processingMinor, lineageMinor, creatorMinor, commissionRate: plan.commission };
}

/** In-game purchase: processor first, then 10% platform service fee, creator gets the rest. */
export function inGameSplit(grossMinor: number, method: PaymentMethod) {
  const processingMinor = processorFeeMinor(method, grossMinor);
  const platformMinor = Math.round((grossMinor - processingMinor) * 0.1);
  const creatorMinor = grossMinor - processingMinor - platformMinor;
  return { grossMinor, processingMinor, platformMinor, creatorMinor };
}

export function payoutFeeMinor(rail: PayoutRail, amountMinor: number, instant = false): number {
  const r = PAYOUT.rails[rail];
  const cfg = instant && "instant" in r ? (r as typeof PAYOUT.rails.bank_transfer).instant : r;
  return Math.max(Math.round(amountMinor * cfg.feeRate), cfg.feeRate > 0 || instant ? cfg.feeFloorMinor : 0);
}

/* ---------------- posting builders (always balanced) ------------------------ */
export function topupPostings(priceMinor: number) {
  return [
    { account: "gateway_clearing" as const, deltaMinor: priceMinor },
    { account: "deferred_acu_revenue" as const, deltaMinor: -priceMinor },
  ];
}
export function salePostings(s: ReturnType<typeof marketplaceSplit>) {
  const postings: Array<{ account: LedgerAccount; deltaMinor: number }> = [
    { account: "gateway_clearing", deltaMinor: s.grossMinor - s.processingMinor },
    { account: "platform_revenue", deltaMinor: -s.commissionMinor },
    { account: "creator_earnings", deltaMinor: -s.creatorMinor },
  ];
  if (s.lineageMinor > 0) postings.push({ account: "lineage_royalties", deltaMinor: -s.lineageMinor });
  return postings;
}
export function payoutPostings(amountMinor: number, feeMinor: number) {
  return [
    { account: "creator_earnings" as const, deltaMinor: amountMinor },
    { account: "payout_processing" as const, deltaMinor: -(amountMinor - feeMinor) },
    { account: "platform_revenue" as const, deltaMinor: -feeMinor },
  ];
}

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

/* ---------------- commission authority --------------------------------------
 * A lower commission is a DISCOUNT, and a discount must never be reachable by
 * accident. Two rules make that true, and both live here because commission is
 * the number this file exists to own.
 */

/** The rate charged when the seller's plan cannot be established — an unknown
 *  plan id, a null column on a legacy listing, a lapsed subscription. It is the
 *  HIGHEST commission on the ladder, derived rather than typed, so adding a plan
 *  can never quietly make the unknown case cheaper. The old code defaulted to
 *  creator_pro (20%), which was cheaper than Creator's 25%: a listing whose plan
 *  we could not read paid LESS than the entry-level tier that we could. */
export const DEFAULT_SELLER_PLAN: PlanId = PLANS
  .filter((p) => p.commission !== null)
  .reduce((worst, p) => (p.commission! > worst.commission! ? p : worst)).id;

/**
 * Which plan a sale settles at: THE ONE THE SELLER HOLDS RIGHT NOW.
 *
 * The listing also stores a `seller_plan`, stamped when the creator set their
 * price, and that stored value used to be the settlement authority. It was
 * justified as protecting a checkout already in flight from re-pricing under
 * the buyer — but the buyer pays `price_minor`, which is a different stored
 * column entirely. Commission only ever splits the SELLER's side, so freezing
 * it protected nobody and cost us the obvious exploit: subscribe to Studio for
 * one month, price every game at 15%, cancel, and keep selling at 15% forever
 * on a £0 plan.
 *
 * So the stored plan is now a record of what the creator was quoted, shown back
 * to them in the listing UI, and nothing more. Commission is a property of the
 * subscription held at the moment of sale:
 *
 *   upgraded since listing  -> the cheaper rate applies at once, unprompted
 *   downgraded or cancelled -> the dearer rate applies at once
 *   no sellable plan at all -> DEFAULT_SELLER_PLAN, the top of the ladder
 *
 * `stored` is accepted only as a last resort for a seller whose wallet cannot
 * be read at settlement (deleted account, database blip) — better to settle at
 * a rate we once agreed than to fail the webhook and never pay the creator.
 */
export function effectiveSellerPlan(stored?: string | null, current?: string | null): PlanId {
  if (canSell(current)) return current as PlanId;
  if (current === null || current === undefined) {
    // wallet unreadable — not "lapsed". Fall back to what was agreed, if valid.
    if (canSell(stored)) return stored as PlanId;
  }
  return DEFAULT_SELLER_PLAN;
}

/** Can this plan sell on the marketplace at all? Explorer cannot, and the check
 *  belongs here rather than being re-derived as `commission === null` at each
 *  call site — one of which would eventually forget. */
export function canSell(planId?: string | null): boolean {
  const p = PLANS.find((x) => x.id === planId);
  return !!p && p.commission !== null;
}

/* ---------------- who may hold AI credit without paying for it -------------
 * NO FREE AI is the standing rule, with exactly one carve-out: accounts WE
 * designate as testers. The distinction is the wallet category, and it is why
 * the category must never be self-selected:
 *
 *   standard   public signup. Gated — zero credit until the account tops up.
 *   tester     designated by an admin holding MODERATION_KEY. Funded freely,
 *              because the only way to become one is for us to say so.
 *   purchased  set by verified Stripe settlement. TERMINAL: a wallet that has
 *              ever paid can never be moved back, so nobody converts a real
 *              account into a free-refill account.
 */
export const WALLET_CATEGORIES = ["standard", "tester", "purchased"] as const;
export type WalletCategory = (typeof WALLET_CATEGORIES)[number];

/** What a public signup gets. Gated by design — see WALLET_CATEGORIES. */
export const DEFAULT_WALLET_CATEGORY: WalletCategory = "standard";

/** Categories an admin may assign. `purchased` is deliberately absent: it is
 *  Stripe's to set, and hand-assigning it would let an admin silently strip a
 *  tester of their refill, or fake a payment that never happened. */
export const ASSIGNABLE_WALLET_CATEGORIES = ["standard", "tester"] as const;

/** A tester must never stop mid-session for credit, so the ceiling is generous:
 *  20,000 ACUs is ~80 3D forges at the 250-ACU hold. It costs nothing to raise
 *  because testers are admin-designated, not self-served. */
export const TESTER_CEILING_ACU = 20_000;

/** Anti-runaway only — a looping client must not hammer the refill endpoint.
 *  A tester who genuinely spends the ceiling tops back up a minute later. */
export const TESTER_REFILL_COOLDOWN_SECONDS = 60;

/**
 * Did this settlement actually pay for what it is about to be credited?
 *
 * Everything we grant — top-up ACUs, a plan's monthly ACUs — is keyed off the
 * package or plan named in the session METADATA, which our own server wrote and
 * Stripe signed, so it cannot be forged. What it can be is DECOUPLED from the
 * money, and in two ordinary ways that need no attacker at all:
 *
 *   a 100%-off promotion code    — metadata still says acu_1000, £0 arrives,
 *                                  100,000 ACUs are credited for nothing
 *   a free trial on a plan       — invoice.paid fires with amount_paid = 0 and
 *                                  the month's ACUs are granted every cycle
 *
 * Both are things a marketing campaign switches on in the Stripe dashboard
 * without touching this repo, so the code has to be the thing that notices.
 *
 * A partial discount is a normal commercial decision and is honoured in full —
 * halving someone's ACUs because they used a valid coupon would make the coupon
 * meaningless. A settlement of ZERO is not a discount, it is a giveaway, and it
 * only ever happens by configuration. It is refused and reported.
 */
export function grantCheck(amountPaidMinor: number | null | undefined, listPriceMinor: number): {
  grant: boolean; discounted: boolean; paidMinor: number; reason: string;
} {
  // Missing amount (an older API shape, a field Stripe did not send) is not
  // evidence of non-payment — the event only exists because a charge settled.
  if (amountPaidMinor === null || amountPaidMinor === undefined) {
    return { grant: true, discounted: false, paidMinor: listPriceMinor, reason: "amount absent — trusting the settled event" };
  }
  const paid = Number(amountPaidMinor);
  if (!Number.isFinite(paid) || paid <= 0) {
    return { grant: false, discounted: true, paidMinor: 0, reason: "nothing was paid (100% discount, free trial, or a £0 invoice)" };
  }
  if (paid < listPriceMinor) {
    return { grant: true, discounted: true, paidMinor: paid, reason: `discounted: £${(paid / 100).toFixed(2)} of £${(listPriceMinor / 100).toFixed(2)}` };
  }
  return { grant: true, discounted: false, paidMinor: paid, reason: "paid in full" };
}

export const PaymentMethods = ["card", "bitripay", "mobile_money"] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

/* ---------------- pay-out: rails and rules ---------------------------------- */
/**
 * How long a marketplace sale sits before the seller can withdraw it.
 *
 * Without this the platform carries the whole chargeback risk: list at £5,000,
 * buy it with a stolen card, withdraw the same afternoon, and the dispute
 * arrives weeks later against money that has already left. The clearing period
 * is what makes the fraud unprofitable — the payout is still here when the
 * chargeback lands, so reversing it costs us nothing.
 *
 * 14 days is the trade-off, not a guarantee. UK card disputes can be raised up
 * to 120 days out, so a long-tail chargeback can still outrun this; what it
 * stops is the same-day cash-out, which is the version that actually gets
 * automated. Raise it here — one constant, read by the ledger — if real dispute
 * data says the tail matters more than creator patience.
 */
export const EARNINGS_CLEARING_DAYS = 14;

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
/** Below this, UK card processing (1.4% + 20p) exceeds the sale and the
 *  creator's payout goes NEGATIVE — the seller would be charged for selling.
 *  Break-even is 27p on the card rail; 50p leaves a real margin at every rate. */
export const MIN_LISTING_PRICE_MINOR = 50;
export const CheckoutRequestSchema = z.object({
  listingId: z.string().min(1),
  priceMinor: z.number().int().min(MIN_LISTING_PRICE_MINOR).max(10_000_000),
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
  // An unreadable plan settles at the TOP of the ladder, never the middle of it.
  // This used to be `?? "creator_pro"`, so a listing whose seller_plan was null
  // or unrecognised paid 20% — less than the 25% an actual Creator subscriber
  // pays. Getting the plan wrong must never be cheaper than getting it right.
  const plan = PLANS.find((p) => p.id === opts.sellerPlan) ?? PLANS.find((p) => p.id === DEFAULT_SELLER_PLAN)!;
  if (plan.commission === null) throw new Error("This plan cannot sell on the marketplace");
  // Defence in depth: the schema enforces the floor at the edge, but this is the
  // money function — refuse outright rather than compute a negative payout for a
  // caller that bypassed validation.
  if (!Number.isInteger(opts.grossMinor) || opts.grossMinor < MIN_LISTING_PRICE_MINOR) {
    throw new Error(`Listing price must be at least ${MIN_LISTING_PRICE_MINOR}p — below that, processing fees exceed the sale`);
  }
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

/**
 * JOSHRIX referral + influencer partner programme — contracts and earnings math.
 * Base rules from docs/MONETISATION.md §Referrals: referrer earns 5% of the first
 * year's net subscription revenue; the referred creator gets bonus promotional
 * ACUs; commission is paid only after the refund period; self-referral is blocked.
 * Influencer tiers raise the share as activated referrals grow. Referral earnings
 * credit the same `creator_earnings` ledger account and ride the same payout
 * rails as marketplace income (shared/payments.ts) — one wallet, one payout.
 */
import { z } from "zod";
import { PLANS, type PlanId } from "./payments";

export const REFERRAL = {
  refereeBonusAcu: 100,        // promotional category, 30–90 day expiry per wallet rules
  refundHoldDays: 14,          // earnings unlock after the refund window
  cookieWindowDays: 30,        // click → signup attribution window
  selfReferralBlocked: true,   // same person/payment method/device heuristics
  maxCodesPerUser: 3,
} as const;

/** Influencer partner tiers — share applies to the first 12 months of each
 *  activated referral's paid subscription. marketplaceFeeShare is the slice of
 *  PLATFORM commission (never the creator's side) on referred users' sales. */
export const INFLUENCER_TIERS = [
  { id: "partner", name: "Partner", minActivated: 0, subShareYear1: 0.05, marketplaceFeeShare: 0,
    perks: ["Personal code + link", "+100 promo ACUs per activated referral", "Partner badge"] },
  { id: "rising", name: "Rising Icon", minActivated: 25, subShareYear1: 0.075, marketplaceFeeShare: 0.01,
    perks: ["7.5% first-year share", "1% of platform commission on referred sales", "Showcase feature", "Early agent access"] },
  { id: "icon", name: "JOSHRIX Icon", minActivated: 100, subShareYear1: 0.10, marketplaceFeeShare: 0.02,
    perks: ["10% first-year share", "2% of platform commission on referred sales", "Co-marketing", "Dedicated partner manager"] },
] as const;
export type InfluencerTierId = (typeof INFLUENCER_TIERS)[number]["id"];

export function tierFor(activatedReferrals: number) {
  return [...INFLUENCER_TIERS].reverse().find((t) => activatedReferrals >= t.minActivated) ?? INFLUENCER_TIERS[0];
}

export const CreateReferralCodeSchema = z.object({
  handle: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/, "letters, numbers, - and _ only"),
});

export const ReferralActivationSchema = z.object({
  planId: z.enum(PLANS.map((p) => p.id) as [PlanId, ...PlanId[]]),
  monthsPaid: z.number().int().min(0).max(12),
});

/** Earnings = tier share × subscription revenue actually paid in year one,
 *  per activated referral (capped at 12 months each). Returns minor units. */
export function referralEarningsMinor(
  activations: Array<z.infer<typeof ReferralActivationSchema>>,
  activatedCount = activations.length,
): { tierId: InfluencerTierId; earnedMinor: number; perReferral: number[] } {
  const tier = tierFor(activatedCount);
  const perReferral = activations.map((a) => {
    const plan = PLANS.find((p) => p.id === a.planId)!;
    return Math.round(plan.monthlyMinor * Math.min(a.monthsPaid, 12) * tier.subShareYear1);
  });
  return { tierId: tier.id, earnedMinor: perReferral.reduce((s, v) => s + v, 0), perReferral };
}

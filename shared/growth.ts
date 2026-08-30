/**
 * JOSHRIX Growth Partner Programme — the controlled growth engine.
 * Not a loose referral scheme: ACUs and privileges come first; CASH commission
 * unlocks only after 20 verified PAID referrals (or immediately for approved
 * influencers), and is paid solely on Verified Net Revenue.
 */

export const GROWTH = {
  /** lifetime commission rate once unlocked */
  commissionRate: 0.01,
  /** no monthly cap — bounded only by the per-customer lifetime cap */
  monthlyCapMinor: null as number | null,
  perCustomerLifetimeCapMinor: 2_000_000, // £20,000 per customer, lifetime
  minPayoutMinor: 2_500,                  // £25 minimum payout
  validationDays: [30, 45] as const,      // validation window before approval
  kycRequired: true,
  manualReviewAboveMinor: 100_000,        // £1,000 → manual review
  executiveApprovalAboveMinor: 500_000,   // £5,000 → executive approval
  commissionUnlockAfterPaidReferrals: 20,
} as const;

/**
 * What a partner is actually paid when a referral converts, in ACUs.
 *
 * The ladder below said "ACU bonus" and named no figure, and nothing anywhere
 * paid one — the whole programme was a description. This is the number the
 * ledger now credits, so the promise and the payment come from the same
 * constant and cannot drift apart.
 *
 * ACUs rather than cash by design: cash needs KYC, a validation window and a
 * payout rail (see GROWTH.kycRequired and validationDays), which is what the
 * 20-referral commission unlock is for. A credit costs us provider time we
 * already price at a 4x markup, and it can be granted the moment money lands.
 */
export const REFERRAL_REWARD_ACU = 100;

/** Paid referrals → the status shown on /referrals. Derived from the ladder so
 *  a rung added below is reflected everywhere without a second list. */
export function referralStatus(paidReferrals: number): string {
  let status = "Referrer";
  for (const rung of GROWTH_LADDER) if (paidReferrals >= rung.paidReferrals) status = rung.status;
  return status;
}

/** The reward ladder — paid referrals → status → reward. */
export const GROWTH_LADDER = [
  { paidReferrals: 1, status: "Starter", reward: "ACU bonus" },
  { paidReferrals: 5, status: "Connector", reward: "More ACUs + badge" },
  { paidReferrals: 10, status: "Builder", reward: "Premium feature access" },
  { paidReferrals: 20, status: "Verified Growth Referrer", reward: "Unlock 1% lifetime commission" },
  { paidReferrals: 50, status: "Power Referrer", reward: "Higher privileges" },
  { paidReferrals: 100, status: "Elite Referrer", reward: "Partner status" },
] as const;

/** Verified Net Revenue = payment received − every deduction below. */
export const NET_REVENUE_DEDUCTIONS = [
  "VAT / tax", "payment fees", "refunds", "chargebacks", "discounts",
  "credits", "free ACUs", "promotional value", "fraud deductions",
] as const;

/** Commission is NEVER paid on any of these. */
export const NEVER_COMMISSIONABLE = [
  "free users", "free trials", "free ACUs", "refunded payments", "failed payments",
  "chargebacks", "self-referrals", "existing JOSHRIX customers", "duplicate accounts",
  "fake users", "abusive users", "internal / admin accounts",
] as const;

/** Trust Score signals that hold or block a referral. */
export const FRAUD_SIGNALS = [
  "same device", "same IP", "same payment card", "same bank details", "VPN abuse",
  "disposable email", "rapid signup bursts", "refund patterns",
] as const;

export const REWARD_PATH = ["Pending", "Verified", "Approved", "Paid"] as const;
export const RISK_PATH = ["Held", "Rejected", "Reversed"] as const;

export function statusForPaidReferrals(n: number): string {
  let s = "Member";
  for (const step of GROWTH_LADDER) if (n >= step.paidReferrals) s = step.status;
  return s;
}

/** Commission on a customer's verified net revenue, respecting the lifetime cap. */
export function commissionMinor(verifiedNetRevenueMinor: number, alreadyEarnedFromCustomerMinor = 0): number {
  const raw = Math.floor(verifiedNetRevenueMinor * GROWTH.commissionRate);
  const room = Math.max(0, GROWTH.perCustomerLifetimeCapMinor - alreadyEarnedFromCustomerMinor);
  return Math.min(raw, room);
}

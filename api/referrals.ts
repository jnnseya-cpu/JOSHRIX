/**
 * /api/referrals — the Growth Partner Programme.
 * GET  → full programme: reward ladder, partner classes, verified-net-revenue
 *        rules, anti-fraud signals and payout policy (single source: shared/growth.ts)
 * POST → mint a partner link (demo until referral tracking persists server-side;
 *        production wires signup attribution + Trust Score checks)
 */
import { z } from "zod";
import { GROWTH, GROWTH_LADDER, NET_REVENUE_DEDUCTIONS, NEVER_COMMISSIONABLE, FRAUD_SIGNALS, REWARD_PATH, RISK_PATH, REFERRAL_REWARD_ACU, statusForPaidReferrals } from "../shared/growth";
import { getDb, ensureReferralSchema, claimReferralCode, referralStats, walletOwnerUid } from "./_ledger";
import { callerIdentity } from "./_auth";

const CreateLinkSchema = z.object({ handle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_-]+$/) });

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    /* This used to mint a code from the handle, answer `mode: "demo"` and
       record nothing — so /referrals handed people a link that could never pay
       them, while the GET below described a reward ladder in detail. The code
       is now owned by a wallet, the link attributes signups to it, and a
       conversion credits REFERRAL_REWARD_ACU. */
    return (async () => {
      const parsed = CreateLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid handle", issues: parsed.error.issues.slice(0, 3) });

      const sql = getDb();
      if (!sql) return res.status(503).json({ error: "The referral programme needs the ledger, which is not reachable." });

      const walletId = String((req.body ?? {}).walletId ?? "");
      if (!/^w-[a-z0-9]{6,40}$/.test(walletId)) {
        return res.status(400).json({ error: "Open the Studio first — a referral link belongs to an account." });
      }
      // A referral link earns real credit, so it must belong to a real person:
      // once a wallet is bound to a sign-in, only that sign-in claims its code.
      const ownerUid = await walletOwnerUid(sql, walletId);
      if (ownerUid) {
        const caller = await callerIdentity(req);
        if (!caller || caller.uid !== ownerUid) {
          return res.status(401).json({ error: "Sign in to claim your referral link.", code: "auth_required" });
        }
      }

      await ensureReferralSchema(sql);
      const code = "JX-" + parsed.data.handle.toUpperCase();
      const claimed = await claimReferralCode(sql, walletId, code);
      if (!claimed) {
        return res.status(409).json({ error: "That handle is already taken — pick another." });
      }
      const stats = await referralStats(sql, walletId);
      return res.status(200).json({
        mode: "live",
        code: claimed.code,
        link: "https://www.joshrix.com/?ref=" + claimed.code,
        created: claimed.created,
        stats: {
          referred: stats.referred,
          paid: stats.converted,
          acuEarned: stats.acu_earned,
          status: statusForPaidReferrals(stats.converted),
          rewardPerConversion: REFERRAL_REWARD_ACU,
          commissionUnlocksAfter: GROWTH.commissionUnlockAfterPaidReferrals,
        },
        note: claimed.created
          ? "Your link is live. Anyone who signs up through it and then pays is attributed to you."
          : "This is the link already registered to your account.",
      });
    })().catch((err: any) => res.status(502).json({ error: "Referral link failed", detail: String(err?.message ?? err).slice(0, 200) }));
  }

  if (req.method !== "GET") return res.status(405).json({ error: "GET or POST" });

  return res.status(200).json({
    programme: {
      name: "JOSHRIX Growth Partner Programme",
      summary: "Refer paying users, collect ACUs and privileges, then unlock 1% lifetime commission after 20 paid referrals. Approved influencers earn 1% immediately. Commission is paid solely on verified net revenue.",
      commission: {
        rate: GROWTH.commissionRate,
        monthlyCap: GROWTH.monthlyCapMinor,
        perCustomerLifetimeCapMinor: GROWTH.perCustomerLifetimeCapMinor,
        unlockAfterPaidReferrals: GROWTH.commissionUnlockAfterPaidReferrals,
      },
      ladder: GROWTH_LADDER,
      classes: [
        { id: "normal", name: "Normal Referrer", terms: "ACUs, badges, feature privileges, priority support, early access and status upgrades. No cash until 20 paid referrals." },
        { id: "verified", name: "Verified Growth Referrer", terms: "1% lifetime commission, unlocked after 20 paid referrals — no monthly cap, £20,000/customer lifetime cap, fraud checks, refund deductions and KYC apply." },
        { id: "influencer", name: "Approved Influencer", terms: "1% lifetime commission immediately on verified net revenue — no monthly cap, £20,000/customer lifetime cap, strict fraud and quality checks." },
      ],
      verifiedNetRevenue: { formula: "customer payment received − deductions", deductions: NET_REVENUE_DEDUCTIONS, neverOn: NEVER_COMMISSIONABLE },
      antiFraud: { trustScoreSignals: FRAUD_SIGNALS, rewardPath: REWARD_PATH, riskPath: RISK_PATH },
      payouts: {
        minPayoutMinor: GROWTH.minPayoutMinor,
        validationDays: GROWTH.validationDays,
        kycRequired: GROWTH.kycRequired,
        manualReviewAboveMinor: GROWTH.manualReviewAboveMinor,
        executiveApprovalAboveMinor: GROWTH.executiveApprovalAboveMinor,
        notes: "Chargebacks are deducted from future earnings; fraud leads to account suspension.",
      },
    },
  });
}

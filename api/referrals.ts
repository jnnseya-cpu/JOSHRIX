/**
 * /api/referrals — influencer + referral programme.
 * GET  → programme terms, tiers, and a demo partner dashboard (real earnings math).
 * POST → mint a referral code (demo; production persists + enforces max codes,
 *        self-referral heuristics, and refund-hold release jobs).
 */
import { REFERRAL, INFLUENCER_TIERS, CreateReferralCodeSchema, referralEarningsMinor } from "../shared/referrals";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const parsed = CreateReferralCodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid handle", issues: parsed.error.issues.slice(0, 3) });
    return res.status(200).json({
      mode: "demo",
      code: "JX-" + parsed.data.handle.toUpperCase(),
      link: "https://joshrix.com/?ref=JX-" + parsed.data.handle.toUpperCase(),
      rules: REFERRAL,
    });
  }

  if (req.method !== "GET") return res.status(405).json({ error: "GET or POST" });

  // demo partner: 31 activated referrals → Rising Icon tier; earnings from real math
  const sample = referralEarningsMinor(
    [
      { planId: "creator", monthsPaid: 12 },
      { planId: "creator_pro", monthsPaid: 9 },
      { planId: "creator_pro", monthsPaid: 12 },
      { planId: "studio", monthsPaid: 6 },
    ],
    31,
  );
  return res.status(200).json({
    mode: "demo",
    programme: { ...REFERRAL, tiers: INFLUENCER_TIERS },
    dashboard: {
      code: "JX-JUSTIN",
      link: "https://joshrix.com/?ref=JX-JUSTIN",
      clicks: 1240,
      signups: 86,
      activated: 31,
      tier: sample.tierId,
      earnedMinor: sample.earnedMinor,
      onHoldMinor: 2_450, // inside the refund window
      note: "Referral earnings credit creator_earnings and withdraw through the same payout rails.",
    },
  });
}

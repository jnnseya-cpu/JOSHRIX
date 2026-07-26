/**
 * GET /api/wallet — demo wallet snapshot (production: per-authenticated-user,
 * balances derived from the Postgres ledger, Firestore mirrors display-only).
 */
import { marketplaceSplit, salePostings, topupPostings, PAYOUT } from "../shared/payments";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const sale = marketplaceSplit({ grossMinor: 499, method: "card", sellerPlan: "creator_pro", hasLineage: false });
  const remixSale = marketplaceSplit({ grossMinor: 499, method: "card", sellerPlan: "creator_pro", hasLineage: true });
  return res.status(200).json({
    mode: "demo",
    currency: "GBP",
    acu: {
      total: 1873,
      byCategory: { promotional: 40, subscription: 833, purchased: 1000, referral: 0 },
      consumptionOrder: ["promotional", "subscription", "purchased", "contract"],
    },
    earnings: { availableMinor: 48_200, pendingMinor: 12_350, lifetimeMinor: 96_400 },
    payout: { minMinor: PAYOUT.minMinor, scheduleDays: PAYOUT.scheduleDays, kycThresholdMinor: PAYOUT.kycThresholdMinor },
    recentLedger: [
      { kind: "acu_topup", label: "£25 top-up → 2,500 ACUs", postings: topupPostings(2_500) },
      { kind: "marketplace_sale", label: "Penalty King sold £4.99 (Creator Pro 20%)", postings: salePostings(sale), split: sale },
      { kind: "marketplace_sale", label: "Remix sold £4.99 (with 30% lineage)", postings: salePostings(remixSale), split: remixSale },
    ],
  });
}

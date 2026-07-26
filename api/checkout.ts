/**
 * POST /api/checkout — pay-in: marketplace purchase with full split math
 * (commission by seller plan, processor fee, optional remix lineage royalty).
 */
import { CheckoutRequestSchema, marketplaceSplit, salePostings } from "../shared/payments";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = CheckoutRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid checkout request", issues: parsed.error.issues.slice(0, 3) });

  try {
    const split = marketplaceSplit({
      grossMinor: parsed.data.priceMinor,
      method: parsed.data.method,
      sellerPlan: parsed.data.sellerPlan,
      hasLineage: parsed.data.hasLineage,
    });
    return res.status(200).json({
      mode: "demo",
      listingId: parsed.data.listingId,
      split,
      ledger: { kind: "marketplace_sale", postings: salePostings(split) },
      note: "Production: gateway checkout → verified webhook → post ledger tx → grant entitlement + licence, credit creator_earnings and lineage_royalties.",
    });
  } catch (err: any) {
    return res.status(400).json({ error: String(err?.message ?? err) });
  }
}

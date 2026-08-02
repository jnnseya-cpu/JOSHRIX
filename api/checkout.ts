/**
 * POST /api/checkout — marketplace purchase.
 * Body: { listingId, method?, buyerWalletId?, buyerEmail? }
 *
 * PRICE AUTHORITY: the price, the seller and the seller's plan are read from the
 * LISTING in the database. Nothing about the money comes from the buyer's
 * request — a client-supplied price is not a price. The split is computed from
 * the stored price, a real Stripe Checkout Session is created for that exact
 * amount, and the entitlement is granted ONLY by the verified webhook.
 */
import Stripe from "stripe";
import { CheckoutRequestSchema, marketplaceSplit, salePostings, MIN_LISTING_PRICE_MINOR, PLANS } from "../shared/payments";
import { getDb, ensureGameSchema, getListing } from "./_ledger";
import { safeOrigin } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { listingId, method, buyerWalletId, buyerEmail } = (req.body ?? {}) as Record<string, string>;
  if (!listingId || typeof listingId !== "string") {
    return res.status(400).json({ error: "listingId required" });
  }

  const sql = getDb();
  if (!sql) {
    // No listing store: quote the split from the request so the flow stays
    // inspectable offline, but make it unmistakable that nothing was sold.
    const parsed = CheckoutRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid checkout request", issues: parsed.error.issues.slice(0, 3) });
    const q = marketplaceSplit({ grossMinor: parsed.data.priceMinor, method: parsed.data.method, sellerPlan: parsed.data.sellerPlan, hasLineage: parsed.data.hasLineage });
    return res.status(200).json({
      mode: "no_db", sold: false, listingId, split: q, ledger: { kind: "marketplace_sale", postings: salePostings(q) },
      note: "Quote only — no listing store configured, so no purchase was made.",
    });
  }

  try {
    await ensureGameSchema(sql);
    const listing = await getListing(sql, listingId);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.status !== "approved") return res.status(409).json({ error: "This world is not on sale yet (awaiting review)." });

    const priceMinor = Number(listing.price_minor ?? 0);
    if (!priceMinor || priceMinor < MIN_LISTING_PRICE_MINOR) {
      return res.status(409).json({ error: "This world has no valid sale price set by its creator." });
    }
    const sellerPlan = PLANS.find((p) => p.id === listing.seller_plan)?.id ?? "creator_pro";
    const payMethod = (method === "bitripay" || method === "mobile_money") ? method : "card";
    const split = marketplaceSplit({ grossMinor: priceMinor, method: payMethod, sellerPlan, hasLineage: false });

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: "Payments are not configured — STRIPE_SECRET_KEY is missing.", sold: false });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = safeOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: priceMinor, product_data: { name: String(listing.title).slice(0, 120) } } }],
      metadata: {
        kind: "marketplace_sale",
        gameId: listing.id,
        priceMinor: String(priceMinor),
        sellerWallet: listing.creator_wallet ?? "",
        ...(buyerWalletId ? { buyerWalletId: String(buyerWalletId).slice(0, 80) } : {}),
      },
      ...(buyerEmail && /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(buyerEmail)) ? { customer_email: String(buyerEmail) } : {}),
      success_url: `${origin}/play/${encodeURIComponent(listing.id)}?purchased=1`,
      cancel_url: `${origin}/marketplace.html?purchase=cancelled`,
    });
    return res.status(200).json({
      mode: "live", sold: false, checkoutUrl: session.url, sessionId: session.id,
      listing: { id: listing.id, title: listing.title, priceMinor },
      split, ledger: { kind: "marketplace_sale", postings: salePostings(split) },
      note: "Entitlement is granted ONLY when the verified webhook receives checkout.session.completed.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Checkout failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}

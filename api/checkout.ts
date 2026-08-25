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
import { CheckoutRequestSchema, marketplaceSplit, salePostings, MIN_LISTING_PRICE_MINOR, effectiveSellerPlan, canSell } from "../shared/payments";
import { getDb, ensureGameSchema, getListing, getWallet } from "./_ledger";
import { safeOrigin, clientIp, rateLimit, tooMany } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const _sql = getDb();
  if (_sql) {
    const _rl = await rateLimit(_sql, "checkout:" + clientIp(req), 20, 3600);
    if (!_rl.ok) return tooMany(res, _rl.retryAfter, "purchase attempts");
  }

  const { listingId, method, buyerWalletId, buyerEmail } = (req.body ?? {}) as Record<string, string>;
  // Game ids are minted by us as "g-<slug>-<10 hex>", so anything outside that
  // alphabet is not a listing anyone could be buying. Rejecting on shape keeps
  // hostile input out of the lookup, the logs and the response entirely.
  if (!listingId || typeof listingId !== "string" || !/^[a-z0-9-]{1,120}$/.test(listingId)) {
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

    // SELF-PURCHASE. Buying your own listing routes real card money through the
    // platform and back out as withdrawable earnings, which is the shape of a
    // stolen-card cash-out: list high, buy from yourself, withdraw, let the
    // chargeback land on us. There is no legitimate reason to buy a world you
    // already own outright, so it is refused rather than merely flagged.
    if (buyerWalletId && listing.creator_wallet && String(buyerWalletId) === listing.creator_wallet) {
      return res.status(409).json({ error: "This is your own world — you already own it. Open it from your dashboard." });
    }

    // COMMISSION AUTHORITY: the plan the seller holds NOW, not the one frozen on
    // the listing when they set the price. A lapsed seller cannot keep selling at
    // the rate of a subscription they stopped paying for — see effectiveSellerPlan.
    const sellerWallet = listing.creator_wallet ? await getWallet(sql, listing.creator_wallet) : null;
    const currentPlan = sellerWallet ? ((sellerWallet as any).plan ?? "explorer") : null;
    if (sellerWallet && !canSell(currentPlan)) {
      // Explorer cannot sell. listing.ts enforces that when a price is SET; this
      // enforces it continuously, so cancelling a plan takes the games off sale
      // instead of leaving them selling at a rate nobody is paying for.
      return res.status(409).json({ error: "This world is not on sale at the moment. Its creator's selling plan is not active." });
    }
    const sellerPlan = effectiveSellerPlan(listing.seller_plan, currentPlan);
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

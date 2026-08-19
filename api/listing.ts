/**
 * POST /api/listing — put a world on sale, or take it off.
 * Body: { walletId, gameId, priceMinor }   priceMinor null or 0 → unlist
 *
 * This is the missing half of the marketplace. /api/checkout has always read
 * the price from the LISTING rather than the buyer's request — but nothing ever
 * wrote a price, so every game was permanently unsellable and checkout answered
 * "This world has no valid sale price set by its creator" for all of them.
 *
 * COMMISSION AUTHORITY. The seller's tier is read from their WALLET here and
 * stored on the listing. It is never taken from the request, because the tier
 * decides the commission — a client-supplied plan is a client-supplied discount.
 * It is stored rather than looked up at sale time so that changing plans later
 * cannot silently re-price a sale that a buyer is midway through.
 *
 * OWNERSHIP. setListingPrice carries `AND creator_wallet = walletId`, so pricing
 * is authorised by the same statement that performs it. A guessed game id
 * touches nothing, and the response is 404 either way so it cannot be used to
 * discover which ids exist.
 */
import { getDb, ensureGameSchema, getWallet, setListingPrice, getListing } from "./_ledger";
import { PLANS, MIN_LISTING_PRICE_MINOR, marketplaceSplit } from "../shared/payments";
import { clientIp, rateLimit, tooMany } from "./_guard";

/** Matches the ceiling CheckoutRequestSchema enforces, so a price that can be
 *  set is always a price that can be bought. */
const MAX_PRICE_MINOR = 10_000_000;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  // POST only: wallet ids are bearer secrets and must never ride a query string
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { walletId, gameId, priceMinor } = (req.body ?? {}) as Record<string, any>;
  if (!/^w-[a-z0-9]{6,40}$/.test(String(walletId ?? ""))) return res.status(400).json({ error: "Invalid walletId" });
  if (!/^[a-z0-9-]{1,120}$/.test(String(gameId ?? ""))) return res.status(400).json({ error: "Invalid gameId" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Listings come online when the database is connected.", mode: "no_db" });

  try {
    const rl = await rateLimit(sql, "listing:" + String(walletId).slice(0, 80), 60, 3600);
    if (!rl.ok) return tooMany(res, rl.retryAfter, "listing changes");
    const ipRl = await rateLimit(sql, "listing:ip:" + clientIp(req), 120, 3600);
    if (!ipRl.ok) return tooMany(res, ipRl.retryAfter, "listing changes");

    await ensureGameSchema(sql);

    const wallet = await getWallet(sql, String(walletId));
    if (!wallet) return res.status(401).json({ error: "Unknown wallet — open the Studio to initialise one." });

    const plan = PLANS.find((p) => p.id === ((wallet as any).plan ?? "explorer"));
    if (!plan) return res.status(500).json({ error: "This account is on an unrecognised plan — contact support." });
    if (plan.commission === null) {
      return res.status(403).json({
        error: `The ${plan.name} plan cannot sell on the marketplace. Choose a plan to start selling.`,
        plan: plan.id,
        href: "/pricing",
      });
    }

    /* ---- unlist ---- */
    if (priceMinor === null || priceMinor === 0 || priceMinor === undefined) {
      const ok = await setListingPrice(sql, String(gameId), String(walletId), null, plan.id);
      if (!ok) return res.status(404).json({ error: "No game of yours with that id." });
      return res.status(200).json({ ok: true, gameId, listed: false, priceMinor: null });
    }

    /* ---- list ---- */
    // typeof, not Number(): "499" and 499 are the same amount, but accepting a
    // string here means the one place that decides money also does type
    // coercion, and CheckoutRequestSchema (z.number().int()) does not.
    const price = priceMinor;
    if (typeof price !== "number" || !Number.isInteger(price) || price < MIN_LISTING_PRICE_MINOR || price > MAX_PRICE_MINOR) {
      return res.status(400).json({
        error: `A price must be a whole number of pence between ${MIN_LISTING_PRICE_MINOR} and ${MAX_PRICE_MINOR.toLocaleString()}. Below ${MIN_LISTING_PRICE_MINOR}p the card fee exceeds the sale and you would be paid nothing.`,
      });
    }

    const ok = await setListingPrice(sql, String(gameId), String(walletId), price, plan.id);
    if (!ok) return res.status(404).json({ error: "No game of yours with that id." });

    // Show the creator exactly what they will be paid, from the same function
    // that pays them — not a number retyped in the UI.
    const split = marketplaceSplit({ grossMinor: price, method: "card", sellerPlan: plan.id });
    const listing = await getListing(sql, String(gameId));

    return res.status(200).json({
      ok: true,
      gameId,
      listed: true,
      priceMinor: price,
      plan: plan.id,
      commissionRate: plan.commission,
      commissionMinor: split.commissionMinor,
      processingMinor: split.processingMinor,
      youKeepMinor: split.creatorMinor,
      status: listing?.status ?? "unknown",
      // A pending game can carry a price, but nobody can buy it until moderation
      // clears it — say so rather than letting the creator think it is on sale.
      note: listing?.status === "approved"
        ? "On sale now."
        : "Priced — it goes on sale the moment moderation approves it.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not update the listing", detail: String(err?.message ?? err) });
  }
}

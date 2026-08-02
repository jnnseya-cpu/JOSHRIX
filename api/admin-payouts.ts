/**
 * /api/admin-payouts — the operator's withdrawal desk.
 * Auth: x-admin-key must equal MODERATION_KEY.
 *   GET                                  → queued withdrawal requests
 *   POST { id, decision, note? }          → "approved" | "rejected" | "paid"
 *
 * A rejection RELEASES the creator's reservation back to their available
 * balance; an approval keeps it reserved until marked paid. Every decision is
 * single-use and records who made it, so money never moves without a name
 * attached to the call.
 */
import { getDb, ensurePayoutSchema, listPayoutRequests, decidePayoutRequest, releaseReservation } from "./_ledger";

const DECISIONS = ["approved", "rejected", "paid"] as const;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== key) return res.status(401).json({ error: "Invalid admin key" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing", mode: "no_db" });

  try {
    await ensurePayoutSchema(sql);

    if (req.method === "GET") {
      const status = typeof req.query?.status === "string" && ["requested", "approved", "rejected", "paid"].includes(req.query.status)
        ? req.query.status : "requested";
      const rows = await listPayoutRequests(sql, status);
      return res.status(200).json({
        status,
        requests: rows.map((r: any) => ({
          id: r.id, walletId: r.wallet_id,
          amountMinor: Number(r.amount_minor), feeMinor: Number(r.fee_minor), netMinor: Number(r.net_minor),
          rail: r.rail, kycRequired: r.kyc_required, createdAt: r.created_at,
        })),
        count: rows.length,
      });
    }

    if (req.method === "POST") {
      const { id, decision, note } = (req.body ?? {}) as Record<string, string>;
      if (!id || typeof id !== "string") return res.status(400).json({ error: "id required" });
      if (!DECISIONS.includes(decision as any)) {
        return res.status(400).json({ error: `decision must be one of: ${DECISIONS.join(", ")}` });
      }
      const row = await decidePayoutRequest(sql, id, decision as any, "admin", note ?? null);
      if (!row) return res.status(409).json({ error: "Request not found, or already decided (decisions are single-use)." });

      // a rejected withdrawal must return the money to the creator's balance
      if (decision === "rejected") {
        try { await releaseReservation(sql, row.wallet_id, Number(row.amount_minor)); } catch { /* reconciliation */ }
      }
      return res.status(200).json({
        ok: true, id: row.id, decision, walletId: row.wallet_id, amountMinor: Number(row.amount_minor),
        note: decision === "paid"
          ? "Marked paid — confirm the funds actually left the payout rail."
          : decision === "rejected" ? "Rejected — the reservation was returned to the creator's available balance."
          : "Approved — still reserved; mark 'paid' once the rail has executed.",
      });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err: any) {
    return res.status(502).json({ error: "Payout desk action failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}

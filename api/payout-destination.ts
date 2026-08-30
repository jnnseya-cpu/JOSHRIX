/**
 * /api/payout-destination — where a creator's money actually goes.
 *
 * GET    ?walletId=…        list this wallet's destinations (masked)
 * POST   { walletId, rail, label, reference }   add one
 * DELETE { walletId, id }   remove one
 *
 * WHY THIS EXISTS. /api/payout took a raw `destinationRef` straight from the
 * request body, and wallet.html sent the literal string "tok_demo_dest_2941".
 * Every withdrawal request in the system carried the same hard-coded fake, so
 * no payout could ever have reached anybody — the money side of the platform
 * ended at a placeholder.
 *
 * The reference is encrypted at rest (see _secrets.ts) and NEVER returned to
 * anyone, including its owner: they get the last four characters and the label
 * they chose. The operator decrypts it once, at the moment of release, from the
 * admin desk.
 */
import { randomUUID } from "node:crypto";
import { PAYOUT } from "../shared/payments";
import {
  getDb, ensurePayoutDestinationSchema, savePayoutDestination, listPayoutDestinations,
  deletePayoutDestination, walletOwnerUid,
} from "./_ledger";
import { callerIdentity } from "./_auth";
import { encryptSecret, maskTail, payoutSecretConfigured } from "./_secrets";
import { clientIp, rateLimit, tooMany, recordSecurityEvent } from "./_guard";

const RAILS = Object.keys(PAYOUT.rails);

/** Enough shape to catch a typo, loose enough for every rail in every country.
 *  IBANs, sort-code+account, and mobile-money MSISDNs look nothing alike. */
const REF_OK = /^[A-Za-z0-9 +\-_.]{6,64}$/;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "The ledger is not reachable." });

  const body = (req.body ?? {}) as Record<string, any>;
  const walletId = String(req.method === "GET" ? (req.query?.walletId ?? "") : (body.walletId ?? ""));
  if (!/^w-[a-z0-9]{6,40}$/.test(walletId)) return res.status(400).json({ error: "walletId required" });

  try {
    await ensurePayoutDestinationSchema(sql);

    // A payout destination decides where real money lands, so it is owner-only
    // wherever ownership can be established at all.
    const ownerUid = await walletOwnerUid(sql, walletId);
    if (ownerUid) {
      const caller = await callerIdentity(req);
      if (!caller || caller.uid !== ownerUid) {
        return res.status(401).json({ error: "Sign in to manage your payout destinations.", code: "auth_required" });
      }
    }

    if (req.method === "GET") {
      const rows = await listPayoutDestinations(sql, walletId);
      return res.status(200).json({
        destinations: rows.map((d) => ({
          id: d.id, rail: d.rail, label: d.label, endsWith: d.last4, addedAt: d.created_at,
        })),
        configured: payoutSecretConfigured(),
      });
    }

    if (req.method === "POST") {
      const rl = await rateLimit(sql, "payoutdest:" + clientIp(req), 10, 3600);
      if (!rl.ok) return tooMany(res, rl.retryAfter, "destination changes");

      if (!payoutSecretConfigured()) {
        // Refuse rather than store an account number in the clear.
        return res.status(503).json({
          error: "Payout destinations cannot be saved yet — the server has no PAYOUT_SECRET configured, and an account number will not be stored unencrypted.",
          code: "no_payout_secret",
        });
      }
      const rail = String(body.rail ?? "");
      if (!RAILS.includes(rail)) return res.status(400).json({ error: `rail must be one of: ${RAILS.join(", ")}` });
      const label = String(body.label ?? "").trim().slice(0, 40) || rail.replace(/_/g, " ");
      const reference = String(body.reference ?? "").trim();
      if (!REF_OK.test(reference)) {
        return res.status(400).json({ error: "That does not look like an account reference — 6 to 64 letters, digits, spaces, + - _ or ." });
      }

      const existing = await listPayoutDestinations(sql, walletId);
      if (existing.length >= 5) {
        return res.status(409).json({ error: "You already have five saved destinations — remove one first." });
      }

      const id = "pd_" + randomUUID().replace(/-/g, "").slice(0, 18);
      await savePayoutDestination(sql, {
        id, walletId, rail, label,
        enc: encryptSecret(reference),
        last4: maskTail(reference),
      });
      // A new destination is a classic account-takeover payload: the attacker's
      // account, added quietly, drained on the next payout. Recorded so it is
      // reviewable even though the owner check above should prevent it.
      await recordSecurityEvent(sql, "payout_destination_added", "info", { walletId, rail, ip: clientIp(req) });

      return res.status(201).json({
        ok: true,
        destination: { id, rail, label, endsWith: maskTail(reference) },
        note: "Saved and encrypted. It is never shown again in full — only the last four characters, here and on the payout desk.",
      });
    }

    if (req.method === "DELETE") {
      const id = String(body.id ?? "");
      if (!id) return res.status(400).json({ error: "id required" });
      const gone = await deletePayoutDestination(sql, id, walletId);
      return res.status(gone ? 200 : 404).json(gone ? { ok: true, id } : { error: "No such destination on this account." });
    }

    return res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (err: any) {
    return res.status(502).json({ error: "Destination request failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}

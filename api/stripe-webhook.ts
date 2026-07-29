/**
 * POST /api/stripe-webhook — the settlement authority.
 * Stripe calls this on payment events; the SIGNATURE IS THE ONLY TRUST:
 * we verify against STRIPE_WEBHOOK_SECRET on the RAW body, then act.
 * Setup (Stripe Dashboard → Developers → Webhooks → Add endpoint):
 *   URL:    https://<your-vercel-app>.vercel.app/api/stripe-webhook
 *   Events: checkout.session.completed, payment_intent.payment_failed, charge.refunded
 *   Then copy the signing secret into the STRIPE_WEBHOOK_SECRET env var.
 */
import Stripe from "stripe";
import { TOPUP_PACKAGES, topupPostings } from "../shared/payments";
import { getDb, ensureSchema, claimEvent, postTx, creditAcu, recordFounder } from "./_ledger";

// Vercel: disable body parsing so the raw payload is available for verification
export const config = { api: { bodyParser: false } };

async function rawBody(req: any): Promise<Buffer> {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Shared event routing — also used by the Firebase function. */
export function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const kind = session.metadata?.kind;
      if (kind === "acu_topup") {
        const pkg = TOPUP_PACKAGES.find((p) => p.id === session.metadata?.packageId);
        if (!pkg) return { ok: false as const, note: `unknown package ${session.metadata?.packageId}` };
        // PRODUCTION: idempotency check on event.id → post ledger tx to Postgres
        // → credit `purchased` ACUs (12-month validity) to session.metadata.userId
        // → emit telemetry payout.first_payout when applicable.
        return {
          ok: true as const,
          action: "credit_acu",
          eventId: event.id,
          packageId: pkg.id,
          acu: pkg.acu,
          amountMinor: pkg.priceMinor,
          ledger: { kind: "acu_topup", postings: topupPostings(pkg.priceMinor) },
        };
      }
      if (kind === "founder_pass" || session.metadata?.pass) {
        // PRODUCTION: record in Founders Registry, grant bonus ACUs at launch
        return { ok: true as const, action: "founder_pass", eventId: event.id, pass: session.metadata?.pass ?? "unknown" };
      }
      return { ok: true as const, action: "checkout_completed_untyped", eventId: event.id };
    }
    case "payment_intent.payment_failed":
      return { ok: true as const, action: "payment_failed_logged", eventId: event.id };
    case "charge.refunded":
      // PRODUCTION: reverse ledger postings, claw back uncomsumed ACUs, flag account on abuse
      return { ok: true as const, action: "refund_recorded", eventId: event.id };
    default:
      return { ok: true as const, action: "ignored", eventId: event.id, type: event.type };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });

  let event: Stripe.Event;
  try {
    const body = await rawBody(req);
    const sig = req.headers["stripe-signature"];
    event = Stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  const result = handleStripeEvent(event);

  // Persist to the Postgres ledger when DATABASE_URL is configured
  const sql = getDb();
  let persisted: "yes" | "duplicate" | "no_db" | "error" = "no_db";
  if (sql) {
    try {
      await ensureSchema(sql);
      const fresh = await claimEvent(sql, event.id, event.type, { type: event.type });
      if (!fresh) {
        persisted = "duplicate"; // already settled — never double-credit
      } else {
        const session = (event.data?.object ?? {}) as Stripe.Checkout.Session;
        const email = (session as any)?.customer_details?.email ?? null;
        if (result.ok && (result as any).action === "credit_acu") {
          const r = result as Extract<ReturnType<typeof handleStripeEvent>, { action: "credit_acu" }>;
          await postTx(sql, "acu_topup", r.ledger.postings, { eventId: event.id, session: session.id ?? "", packageId: r.packageId });
          await creditAcu(sql, { stripeSession: session.id ?? event.id, email, packageId: r.packageId, acu: r.acu });
        } else if (result.ok && (result as any).action === "founder_pass") {
          await recordFounder(sql, { stripeSession: session.id ?? event.id, pass: (result as any).pass, email, amountMinor: (session.amount_total as number) ?? null });
        }
        persisted = "yes";
      }
    } catch (err: any) {
      persisted = "error";
      console.error(JSON.stringify({ ledgerError: String(err?.message ?? err), eventId: event.id }));
    }
  }

  console.log(JSON.stringify({ stripeWebhook: { ...result, persisted } }));
  return res.status(200).json({ received: true, persisted, ...result });
}

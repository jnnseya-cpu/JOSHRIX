/**
 * /api/economy — the Economy Agent's margin control loop.
 * GET  → evaluate the SKU catalogue at expected costs: margins, alerts, floors.
 * POST → feed OBSERVED costs (the Forge Graph feed: real provider + infra spend
 *        per SKU) and receive the re-evaluation with repricing orders.
 * Production: runs daily + on provider price-change webhooks; act/panic alerts
 * page the admin Economy module and can auto-suspend a SKU.
 *
 * OPERATOR-ONLY. This endpoint answers "what does each SKU cost us against what
 * we charge" — provider cost per top-up, per subscription month, per 3D forge,
 * plus fixed monthly overhead and the price floors. That is the commercial
 * position of the business, and it was readable by anyone with the URL. Same
 * credential convention as /api/traffic: MODERATION_KEY, or the cron secret.
 */
import { SKU_CATALOGUE, CostObservationBatchSchema, evaluateSku, fixedMonthlyOverheadMinor, ECON } from "../shared/economics";

function summarise(rows: ReturnType<typeof evaluateSku>[]) {
  const order = { ok: 0, warn: 1, act: 2, panic: 3 } as const;
  const worst = rows.reduce((w, r) => (order[r.alert] > order[w] ? r.alert : w), "ok" as keyof typeof order);
  return {
    worstAlert: worst,
    floorsHolding: rows.every((r) => r.floorHolding),
    repricesNeeded: rows.filter((r) => r.action.type === "reprice").map((r) => r.sku),
    marginFloor: ECON.targets.grossMarginFloor,
    fixedMonthlyOverheadMinor: fixedMonthlyOverheadMinor(),
  };
}

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-moderation-key");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Fail CLOSED: with no credential configured this stays shut rather than
  // falling back to open, which is how it was readable in the first place.
  const key = process.env.MODERATION_KEY;
  const cron = process.env.CRON_SECRET;
  const authorised = (!!key && String(req.headers["x-moderation-key"] ?? "") === key) ||
                     (!!cron && String(req.headers["authorization"] ?? "") === `Bearer ${cron}`);
  if (!key && !cron) return res.status(503).json({ error: "Economy unavailable — set MODERATION_KEY." });
  if (!authorised) return res.status(401).json({ error: "Unauthorised." });

  if (req.method === "GET") {
    const rows = SKU_CATALOGUE.map((s) => evaluateSku(s));
    return res.status(200).json({ mode: "expected_costs", skus: rows, summary: summarise(rows) });
  }

  if (req.method === "POST") {
    const parsed = CostObservationBatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid observations", issues: parsed.error.issues.slice(0, 3) });
    const rows = parsed.data.observations.map((o) => {
      const base = SKU_CATALOGUE.find((s) => s.sku === o.sku);
      return evaluateSku({
        sku: o.sku,
        label: base?.label,
        retailMinor: o.retailMinor ?? base?.retailMinor ?? 0,
        providerMinor: o.providerMinor,
        infraMinor: o.infraMinor ?? base?.infraMinor ?? 0,
      });
    });
    const unknown = rows.filter((r) => r.retailMinor === 0).map((r) => r.sku);
    if (unknown.length) return res.status(400).json({ error: "Unknown sku(s) without retailMinor", skus: unknown });
    return res.status(200).json({ mode: "observed_costs", skus: rows, summary: summarise(rows) });
  }

  return res.status(405).json({ error: "GET or POST" });
}

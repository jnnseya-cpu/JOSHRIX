/**
 * POST /api/telemetry — Forge Graph collector.
 * Body: { events: TelemetryEvent[] } (max 500 per batch).
 * Demo mode acknowledges and discards; production writes to the Forge Graph store
 * (Firestore stream → warehouse) per docs/DEEP-DIVE.md §4.1 / INTELLIGENCE.md.
 */
import { TelemetryBatchSchema } from "../shared/telemetry";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = TelemetryBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid telemetry batch", issues: parsed.error.issues.slice(0, 5) });
  }
  // Demo mode: validate + acknowledge. Production: enqueue to the Forge Graph store.
  return res.status(200).json({ accepted: parsed.data.events.length, mode: "demo" });
}

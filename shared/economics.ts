/**
 * JOSHRIX fully-loaded unit economics — every cost line, not just AI.
 * The 4× AI-provider rule (MONETISATION) is necessary but NOT sufficient:
 * real margin must also survive payment processing, Google Cloud/Firebase,
 * Vercel bandwidth, VAT, refunds and fixed overheads. This module codifies
 * the complete stack so pricing decisions and margin alerts use one truth.
 * All money in integer-ish minor units (pence); tiny infra unit costs use
 * fractional minor units and round only at the final aggregation.
 * Rates are indicative (July 2026) and admin-tunable in production.
 */

export const ECON = {
  /** UK VAT — consumer prices are VAT-inclusive; net revenue = gross / 1.2 once registered. */
  vatRate: 0.2,
  /** Target floors for the margin engine (of ex-VAT revenue). */
  targets: { grossMarginFloor: 0.6, warnAt: 0.6, actAt: 0.5, panicAt: 0.4 },

  stripe: {
    domestic: { rate: 0.015, fixedMinor: 20 },      // UK cards 1.5% + 20p
    eu: { rate: 0.025, fixedMinor: 20 },            // EEA cards 2.5% + 20p
    intl: { rate: 0.0325, fixedMinor: 20 },         // international 3.25% + 20p
    chargebackMinor: 2000,                          // £20 per dispute
    connectPayout: { rate: 0.0025, fixedMinor: 10 },// paying creators out
    activeAccountMonthlyMinor: 200,                 // ~£2/active connected account
  },

  /** Google Cloud / Firebase marginal costs (converted to pence). */
  gcp: {
    fnInvocationMinor: 0.000033,     // ~$0.40 per million invocations
    fnGibSecondMinor: 0.0002,        // memory-seconds
    fnVcpuSecondMinor: 0.002,        // cpu-seconds (Cloud Run gen2)
    firestoreReadMinor: 0.00005,     // ~$0.06 per 100k reads
    firestoreWriteMinor: 0.00015,    // ~$0.18 per 100k writes
    storageGbMonthMinor: 2.1,        // ~$0.026 / GB-month
    egressGbMinor: 9.6,              // ~$0.12 / GB served
  },

  vercel: { bandwidthGbMinor: 12, proSeatMonthlyMinor: 1600 },

  /** Founder-phase fixed overhead budget (monthly, pence). */
  fixedMonthly: {
    vercelPro: 1600, neonLaunch: 1500, domainAmortised: 100,
    email: 1500, appleDevAmortised: 825, monitoring: 0, misc: 2000,
  },

  /** Refund/chargeback allowance applied to consumer revenue. */
  refundAllowanceRate: 0.015,

  /** Minimum consumer charge — below this the 20p fixed card fee destroys margin. */
  minChargeMinor: 199,
} as const;

export type Region = "domestic" | "eu" | "intl";

export function stripeFeeMinor(grossMinor: number, region: Region = "domestic"): number {
  const r = ECON.stripe[region];
  return Math.round(grossMinor * r.rate) + r.fixedMinor;
}

/** Marginal infra cost of one forge cycle (beyond the AI providers). */
export function forgeInfraCostMinor(opts?: { vcpuSeconds?: number; gibSeconds?: number; reads?: number; writes?: number; storageGb?: number }): number {
  const o = { vcpuSeconds: 240, gibSeconds: 480, reads: 400, writes: 250, storageGb: 0.15, ...opts };
  const g = ECON.gcp;
  return (
    o.vcpuSeconds * g.fnVcpuSecondMinor +
    o.gibSeconds * g.fnGibSecondMinor +
    o.reads * g.firestoreReadMinor +
    o.writes * g.firestoreWriteMinor +
    o.storageGb * g.storageGbMonthMinor
  );
}

/** Marginal cost of serving one play session (mostly egress). */
export function playSessionCostMinor(assetMb = 6): number {
  return (assetMb / 1024) * ECON.gcp.egressGbMinor + 20 * ECON.gcp.fnInvocationMinor;
}

/** Full contribution breakdown for any consumer charge. */
export function contribution(opts: {
  grossMinor: number;
  region?: Region;
  providerMinor?: number;   // attributable AI provider cost
  infraMinor?: number;      // attributable GCP/Vercel marginal cost
  vatRegistered?: boolean;
}) {
  const region = opts.region ?? "domestic";
  const vatMinor = opts.vatRegistered === false ? 0 : Math.round(opts.grossMinor - opts.grossMinor / (1 + ECON.vatRate));
  const exVatMinor = opts.grossMinor - vatMinor;
  const processorMinor = stripeFeeMinor(opts.grossMinor, region);
  const refundMinor = Math.round(opts.grossMinor * ECON.refundAllowanceRate);
  const providerMinor = Math.round(opts.providerMinor ?? 0);
  const infraMinor = Math.round((opts.infraMinor ?? 0) * 100) / 100;
  const contributionMinor = Math.round(exVatMinor - processorMinor - refundMinor - providerMinor - infraMinor);
  return {
    grossMinor: opts.grossMinor, vatMinor, exVatMinor, processorMinor, refundMinor,
    providerMinor, infraMinor: Math.round(infraMinor), contributionMinor,
    marginOnExVat: exVatMinor > 0 ? contributionMinor / exVatMinor : 0,
  };
}

/** The complete price floor: BOTH rules must hold.
 *  Rule A (existing): retail ≥ 4× AI provider cost.
 *  Rule B (new): retail must keep fully-loaded margin ≥ grossMarginFloor after
 *  VAT, payments, refunds, provider and infra. */
export function priceFloorMinor(providerMinor: number, infraMinor = 0, region: Region = "domestic"): number {
  const ruleA = providerMinor * 4;
  // solve gross s.t. contribution/exVat >= floor  (linear in gross)
  const f = ECON.targets.grossMarginFloor;
  const vat = ECON.vatRate;
  const r = ECON.stripe[region].rate;
  const fixed = ECON.stripe[region].fixedMinor;
  const ra = ECON.refundAllowanceRate;
  // exVat = g/(1+vat); costs = g*r + fixed + g*ra + provider + infra
  // (exVat - costs) / exVat >= f  →  g * (1/(1+vat) * (1-f) - r - ra) >= fixed + provider + infra
  const slope = (1 - f) / (1 + vat) - r - ra;
  const ruleB = slope > 0 ? (fixed + providerMinor + infraMinor) / slope : Infinity;
  return Math.max(Math.ceil(ruleA), Math.ceil(ruleB), ECON.minChargeMinor);
}

export function fixedMonthlyOverheadMinor(): number {
  return Object.values(ECON.fixedMonthly).reduce((s, v) => s + v, 0);
}

/** Margin alert level for an observed fully-loaded margin. */
export function marginAlert(marginOnExVat: number): "ok" | "warn" | "act" | "panic" {
  const t = ECON.targets;
  if (marginOnExVat < t.panicAt) return "panic";
  if (marginOnExVat < t.actAt) return "act";
  if (marginOnExVat < t.warnAt) return "warn";
  return "ok";
}

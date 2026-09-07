import type { Slab, SlabBand, TraceNode } from "./types";
import { inr, pct, rupees } from "./money";

/**
 * Income is not taxed at a single flat rate. It is cut into bands, and each
 * band has its own rate. This walks the table, taxes the portion of income
 * that falls inside each band, and sums the result.
 *
 * The per-band breakdown is returned as well as the total, so the interface
 * can show the working rather than only the answer.
 */
export function computeSlabTax(
  taxableIncome: number,
  slabs: Slab[],
  regimeId: string
): { tax: number; bands: SlabBand[]; trace: TraceNode[] } {
  const bands: SlabBand[] = [];
  const trace: TraceNode[] = [];
  let tax = 0;

  slabs.forEach((slab, i) => {
    const upper = slab.to === null ? Number.POSITIVE_INFINITY : slab.to;
    const amountInBand = Math.max(0, Math.min(taxableIncome, upper) - slab.from);
    const taxInBand = rupees(amountInBand * slab.rate);
    tax += taxInBand;

    bands.push({ ...slab, amountInBand, taxInBand });

    if (amountInBand > 0 && slab.rate > 0) {
      trace.push({
        ruleId: `${regimeId}.slab[${i}]`,
        label: `${pct(slab.rate)} on ${rangeLabel(slab)} — ${inr(amountInBand)} of income falls here`,
        inputs: { amountInBand, rate: slab.rate },
        output: taxInBand,
      });
    }
  });

  return { tax, bands, trace };
}

export function rangeLabel(slab: Slab): string {
  if (slab.to === null) return `income above ${inr(slab.from)}`;
  if (slab.from === 0) return `the first ${inr(slab.to)}`;
  return `${inr(slab.from)} to ${inr(slab.to)}`;
}

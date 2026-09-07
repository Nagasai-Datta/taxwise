import { RULES, allowedDeductions, deductionMeta } from "./rules";
import { computeTax } from "./tax";
import type { Deductions, TaxInput } from "./types";

export interface DeductionOpportunity {
  section: string;
  label: string;
  cap: number;
  currentAmount: number;
  headroom: number;
  taxSavedIfFilled: number;
}

export interface OptimizeResult {
  baselineTax: number;
  bestPossibleTax: number;
  totalPotentialSaving: number;
  opportunities: DeductionOpportunity[];
}

/**
 * For each deduction not fully used, work out the actual rupee saving from
 * filling the headroom.
 *
 * The saving is measured by RE-RUNNING the whole tax engine with that section
 * at its cap, not by multiplying headroom by an assumed marginal rate. The
 * naive method is wrong near a slab boundary and badly wrong near the section
 * 87A threshold, where tax drops to zero in a single step rather than tapering.
 */
export function optimizeDeductions(input: Omit<TaxInput, "regime">): OptimizeResult {
  const baseline = computeTax({ ...input, regime: "old" });
  const current = (input.deductions ?? {}) as Record<string, number>;
  const opportunities: DeductionOpportunity[] = [];

  for (const section of allowedDeductions("old")) {
    const meta = deductionMeta(section);
    if (!meta || meta.cap === null) continue;

    const currentAmount = current[section] ?? 0;
    const headroom = Math.max(0, meta.cap - currentAmount);
    if (headroom === 0) continue;

    const filled = { ...(input.deductions ?? {}) } as Record<string, number>;
    filled[section] = meta.cap;

    const withFilled = computeTax({
      ...input,
      regime: "old",
      deductions: filled as Deductions,
    });

    opportunities.push({
      section,
      label: meta.label,
      cap: meta.cap,
      currentAmount,
      headroom,
      taxSavedIfFilled: baseline.totalTax - withFilled.totalTax,
    });
  }

  opportunities.sort((a, b) => b.taxSavedIfFilled - a.taxSavedIfFilled);

  const allFilled = { ...(input.deductions ?? {}) } as Record<string, number>;
  for (const o of opportunities) allFilled[o.section] = o.cap;
  const best = computeTax({ ...input, regime: "old", deductions: allFilled as Deductions });

  return {
    baselineTax: baseline.totalTax,
    bestPossibleTax: best.totalTax,
    totalPotentialSaving: baseline.totalTax - best.totalTax,
    opportunities,
  };
}

export { RULES };

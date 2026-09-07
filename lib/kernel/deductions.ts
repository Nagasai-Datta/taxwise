import { allowedDeductions, deductionMeta } from "./rules";
import type { Deductions, RegimeId, TraceNode } from "./types";
import { inr } from "./money";

export interface CappedDeductions {
  total: number;
  applied: { section: string; label: string; claimed: number; cap: number | null; allowed: number }[];
  trace: TraceNode | null;
}

/**
 * Apply the statutory ceiling to each claimed deduction.
 *
 * You may invest five lakh under 80C, but only one and a half lakh of it
 * reduces your taxable income. Trimming the claim to the cap is the whole
 * job here, and recording that it happened is what lets the interface say
 * why the number came out lower than the user expected.
 */
export function applyDeductionCaps(
  regime: RegimeId,
  claimed: Deductions | undefined
): CappedDeductions {
  const permitted = allowedDeductions(regime);
  const applied: CappedDeductions["applied"] = [];
  const children: TraceNode[] = [];
  let total = 0;

  if (!claimed || permitted.length === 0) {
    return { total: 0, applied, trace: null };
  }

  for (const [section, rawAmount] of Object.entries(claimed)) {
    const amount = rawAmount ?? 0;
    if (amount <= 0) continue;
    if (!permitted.includes(section)) continue;

    const meta = deductionMeta(section);
    if (!meta) continue;

    const allowed = meta.cap === null ? amount : Math.min(amount, meta.cap);
    total += allowed;
    applied.push({ section, label: meta.label, claimed: amount, cap: meta.cap, allowed });

    const capped = meta.cap !== null && amount > meta.cap;
    children.push({
      ruleId: `deductions.${section}`,
      label: capped
        ? `${meta.label}. You claimed ${inr(amount)} but the ceiling is ${inr(meta.cap!)}, so only that much counts.`
        : meta.label,
      inputs: { claimed: amount, cap: meta.cap ?? "no cap" },
      output: allowed,
    });
  }

  if (children.length === 0) return { total: 0, applied, trace: null };

  return {
    total,
    applied,
    trace: {
      ruleId: "deductions.total",
      label: `Chapter VI-A deductions applied (${children.length} section${children.length > 1 ? "s" : ""})`,
      inputs: { sections: children.length },
      output: total,
      children,
    },
  };
}

import { computeTax } from "./tax";
import type { TaxInput, TaxResult } from "./types";
import { inr } from "./money";

export interface RegimeComparison {
  newRegime: TaxResult;
  oldRegime: TaxResult;
  recommended: "new" | "old";
  saving: number;
  marginIsNarrow: boolean;
  rationale: string;
}

/** Below this the old regime's extra record-keeping is arguably not worth it. */
export const NARROW_MARGIN = 5000;

export function compareRegimes(input: Omit<TaxInput, "regime">): RegimeComparison {
  const newRegime = computeTax({ ...input, regime: "new" });
  const oldRegime = computeTax({ ...input, regime: "old" });

  const recommended = newRegime.totalTax <= oldRegime.totalTax ? "new" : "old";
  const saving = Math.abs(newRegime.totalTax - oldRegime.totalTax);
  const marginIsNarrow = saving < NARROW_MARGIN;

  let rationale: string;
  if (marginIsNarrow) {
    rationale =
      `The two regimes are within ${inr(NARROW_MARGIN)} of each other, so the extra record-keeping ` +
      `the old regime demands may not be worth the difference.`;
  } else if (recommended === "new") {
    rationale =
      "The new regime wins here because its wider slabs and larger standard deduction save more " +
      "than the deductions available under the old regime are worth at this income level.";
  } else {
    rationale =
      "The old regime wins here because the HRA exemption and Chapter VI-A deductions together " +
      "cut taxable income by more than the new regime's wider slabs save.";
  }

  return { newRegime, oldRegime, recommended, saving, marginIsNarrow, rationale };
}

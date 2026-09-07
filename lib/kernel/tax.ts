import { RULES, regime, slabsFor } from "./rules";
import { computeSlabTax } from "./slabs";
import { computeHRAExemption } from "./hra";
import { applyDeductionCaps } from "./deductions";
import type { TaxInput, TaxResult, TraceNode } from "./types";
import { inr, rupees } from "./money";

/**
 * The single entry point for a tax computation.
 *
 * Runs in a fixed order: standard deduction, HRA exemption, Chapter VI-A
 * deductions, taxable income, slab tax, section 87A rebate, cess. Every
 * intermediate value is pushed onto the trace as it is produced.
 */
export function computeTax(input: TaxInput): TaxResult {
  const r = regime(input.regime);
  const children: TraceNode[] = [];

  // 1. Standard deduction, salaried income only
  const standardDeduction =
    input.isSalaried && (r.standardDeductionAppliesTo as string[]).includes("salaried")
      ? r.standardDeduction
      : 0;

  if (standardDeduction > 0) {
    children.push({
      ruleId: `${input.regime}.standard_deduction`,
      label: `Standard deduction for salaried income under the ${r.label}`,
      inputs: { regime: r.label },
      output: standardDeduction,
    });
  }

  // 2. HRA exemption, old regime only
  let hraExemption = 0;
  if (r.hraAllowed && input.hra && input.hra.rentAnnual > 0) {
    const hra = computeHRAExemption(input.hra);
    hraExemption = hra.exemption;
    children.push(hra.trace);
  }

  // 3. Chapter VI-A deductions, capped
  const caps = applyDeductionCaps(input.regime, input.deductions);
  if (caps.trace) children.push(caps.trace);

  // 4. Taxable income
  const taxableIncome = Math.max(
    0,
    rupees(input.grossIncome - standardDeduction - hraExemption - caps.total)
  );
  children.push({
    ruleId: "taxable_income",
    label: "Taxable income is gross income less the standard deduction, the HRA exemption and Chapter VI-A deductions",
    inputs: {
      grossIncome: input.grossIncome,
      standardDeduction,
      hraExemption,
      chapterVIA: caps.total,
    },
    output: taxableIncome,
  });

  // 5. Slab tax
  const slab = computeSlabTax(taxableIncome, slabsFor(input.regime), input.regime);
  children.push({
    ruleId: `${input.regime}.slab_table`,
    label: `Tax worked out band by band across the ${r.label} slab table`,
    inputs: { taxableIncome },
    output: slab.tax,
    children: slab.trace,
  });

  // 6. Section 87A rebate
  const reb = r.rebate87A;
  let rebate87A = 0;
  if (taxableIncome <= reb.thresholdTaxableIncome) {
    rebate87A = Math.min(slab.tax, reb.maxRebate);
    if (rebate87A > 0) {
      children.push({
        ruleId: `${input.regime}.rebate_87a`,
        label: `Section 87A rebate applies because taxable income is at or below ${inr(reb.thresholdTaxableIncome)}`,
        inputs: { taxableIncome, maxRebate: reb.maxRebate },
        output: -rebate87A,
      });
    }
  }
  const taxAfterRebate = Math.max(0, slab.tax - rebate87A);

  // 7. Cess
  const cess = rupees(taxAfterRebate * RULES.cess.rate);
  if (cess > 0) {
    children.push({
      ruleId: "cess",
      label: `${RULES.cess.label} at ${RULES.cess.rate * 100}% of the tax after rebate`,
      inputs: { taxAfterRebate },
      output: cess,
    });
  }

  const totalTax = taxAfterRebate + cess;

  return {
    regime: input.regime,
    regimeLabel: r.label,
    grossIncome: input.grossIncome,
    standardDeduction,
    hraExemption,
    chapterVIA: caps.total,
    taxableIncome,
    taxBeforeRebate: slab.tax,
    rebate87A,
    taxAfterRebate,
    cess,
    totalTax,
    effectiveRate: input.grossIncome > 0 ? totalTax / input.grossIncome : 0,
    bands: slab.bands,
    trace: {
      ruleId: "compute_tax",
      label: `Total tax payable under the ${r.label}`,
      inputs: { grossIncome: input.grossIncome, regime: r.label },
      output: totalTax,
      children,
    },
  };
}

import { computeTax } from "./tax";
import { compareRegimes } from "./regimes";
import { RULES } from "./rules";
import { inr, rupees } from "./money";
import type { TraceNode, Deductions } from "./types";
import type { Profile } from "./profiles";

/**
 * Preparing a return.
 *
 * Eight steps, every one of them ordinary code. No model is involved at any
 * point, which matters more here than anywhere else in the system: this is the
 * one output a person might act on.
 *
 * Nothing is submitted anywhere. The result is a JSON document shaped like an
 * ITR-1 that the user can download. Filing remains a thing a person does on
 * the government portal, with this as their working.
 *
 * Field names follow Form 16 Part B as it is actually printed, so a user can
 * copy figures across without translating them.
 */

export interface Form16 {
  /* Part A */
  employerName: string;
  employerTAN: string;
  assessmentYear: string;

  /* Part B, item 1: gross salary */
  salary17_1: number;          // salary under section 17(1)
  perquisites17_2: number;     // value of perquisites under 17(2)
  profitsInLieu17_3: number;   // profits in lieu of salary under 17(3)

  /* item 2: allowances exempt under section 10 */
  hraExempt10_13A: number;     // house rent allowance
  otherExempt10: number;

  /* item 4: deductions under section 16 */
  professionalTax16_3: number; // tax on employment

  /* items 7 and 8: other income the employee reported */
  housePropertyIncome: number; // negative for a loss, such as home loan interest
  otherSourcesIncome: number;

  /* item 10: Chapter VI-A, as processed by the employer */
  deduction80C: number;
  deduction80D: number;
  deduction80CCD1B: number;
  deduction80TTA: number;

  /* Part A, tax actually deducted */
  tdsDeducted: number;
}

export interface ITRStep {
  n: number;
  title: string;
  detail: string;
  value?: number;
  ok: boolean;
}

export interface ITRResult {
  steps: ITRStep[];
  regimeChosen: "new" | "old";
  grossSalary: number;
  exemptAllowances: number;
  standardDeduction: number;
  professionalTax: number;
  salaryIncome: number;
  otherIncome: number;
  grossTotalIncome: number;
  chapterVIA: number;
  totalIncome: number;
  taxPayable: number;
  tdsDeducted: number;
  /** Positive means a refund is due, negative means tax is still owed. */
  refundDue: number;
  savingVsOtherRegime: number;
  itr: Record<string, unknown>;
  warnings: string[];
  trace: TraceNode;
}

/** A Form 16 with everything at zero, used to seed the form. */
export function blankForm16(): Form16 {
  return {
    employerName: "", employerTAN: "", assessmentYear: RULES._meta.assessmentYear,
    salary17_1: 0, perquisites17_2: 0, profitsInLieu17_3: 0,
    hraExempt10_13A: 0, otherExempt10: 0, professionalTax16_3: 0,
    housePropertyIncome: 0, otherSourcesIncome: 0,
    deduction80C: 0, deduction80D: 0, deduction80CCD1B: 0, deduction80TTA: 0,
    tdsDeducted: 0,
  };
}

/**
 * What a Form 16 would plausibly say for this profile.
 *
 * Used only to prefill the form so a user is correcting figures rather than
 * typing from nothing. Every value is editable, and whatever they submit is
 * what gets used.
 */
export function prefillFrom(p: Profile): Form16 {
  const f = blankForm16();
  f.salary17_1 = p.income.grossAnnual;
  f.hraExempt10_13A = 0;   // the employer may or may not have processed it
  f.deduction80C = p.deductions["80C"] ?? 0;
  f.deduction80D = p.deductions["80D"] ?? 0;
  f.deduction80CCD1B = p.deductions["80CCD1B"] ?? 0;
  f.deduction80TTA = p.deductions["80TTA"] ?? 0;
  return f;
}

export function prepareITR(f: Form16, p: Profile): ITRResult {
  const steps: ITRStep[] = [];
  const warnings: string[] = [];
  const children: TraceNode[] = [];

  /* 1 ------------------------------------------------------ gross salary */
  const grossSalary = rupees(f.salary17_1 + f.perquisites17_2 + f.profitsInLieu17_3);
  steps.push({
    n: 1, title: "Read the Form 16", ok: grossSalary > 0, value: grossSalary,
    detail: `Salary under 17(1), perquisites under 17(2) and profits in lieu under 17(3) add to ${inr(grossSalary)}.`,
  });
  if (grossSalary <= 0) warnings.push("Gross salary is zero. Check item 1 of Form 16 Part B.");
  children.push({
    ruleId: "itr.gross_salary", label: "Gross salary, Form 16 item 1",
    inputs: { salary17_1: f.salary17_1, perquisites: f.perquisites17_2, profitsInLieu: f.profitsInLieu17_3 },
    output: grossSalary,
  });

  /* 2 ----------------------------------------- allowances exempt under s10 */
  const exemptAllowances = rupees(f.hraExempt10_13A + f.otherExempt10);
  steps.push({
    n: 2, title: "Subtract exempt allowances", ok: true, value: exemptAllowances,
    detail: exemptAllowances > 0
      ? `${inr(exemptAllowances)} is exempt under section 10, of which ${inr(f.hraExempt10_13A)} is house rent allowance. Exempt allowances are available under the old regime only.`
      : "No allowances were exempted under section 10.",
  });
  children.push({
    ruleId: "itr.exempt_s10", label: "Allowances exempt under section 10, Form 16 item 2",
    inputs: { hra: f.hraExempt10_13A, other: f.otherExempt10 }, output: -exemptAllowances,
  });

  /* 3 ------------------------------------ deductions under section 16 */
  const professionalTax = rupees(f.professionalTax16_3);
  steps.push({
    n: 3, title: "Apply the section 16 deductions", ok: true, value: professionalTax,
    detail: professionalTax > 0
      ? `Professional tax of ${inr(professionalTax)} under section 16(iii). The standard deduction is applied by the engine, at the amount the chosen regime allows.`
      : "No professional tax was deducted. The standard deduction is applied by the engine.",
  });

  /* 4 ---------------------------------------------- other income reported */
  const otherIncome = rupees(f.housePropertyIncome + f.otherSourcesIncome);
  steps.push({
    n: 4, title: "Add any other income", ok: true, value: otherIncome,
    detail: otherIncome === 0
      ? "No other income was reported to the employer."
      : `${inr(otherIncome)} from house property and other sources. A negative figure here is a loss, usually home loan interest.`,
  });
  if (f.housePropertyIncome < -RULES.deductions["24b"].cap!) {
    warnings.push(`A house property loss above ${inr(RULES.deductions["24b"].cap!)} cannot be set off in one year.`);
  }

  /* 5 ------------------------------------------- build the engine's input */
  const deductions: Deductions = {
    "80C": f.deduction80C,
    "80D": f.deduction80D,
    "80CCD1B": f.deduction80CCD1B,
    "80TTA": f.deduction80TTA,
    "24b": f.housePropertyIncome < 0 ? Math.abs(f.housePropertyIncome) : 0,
  };
  const chapterVIAClaimed = rupees(
    f.deduction80C + f.deduction80D + f.deduction80CCD1B + f.deduction80TTA
  );

  // The engine is given gross salary with section 10 exemptions and
  // professional tax already removed, because those act before it.
  const engineIncome = Math.max(0, rupees(
    grossSalary - exemptAllowances - professionalTax + Math.max(0, otherIncome)
  ));

  /* 6 --------------------------------------------- compute both regimes */
  const comparison = compareRegimes({
    grossIncome: engineIncome,
    isSalaried: true,
    deductions,
  });
  const regimeChosen = comparison.recommended;
  const chosen = regimeChosen === "new" ? comparison.newRegime : comparison.oldRegime;

  steps.push({
    n: 5, title: "Compute the tax under both regimes", ok: true,
    detail: `New regime ${inr(comparison.newRegime.totalTax)}, old regime ${inr(comparison.oldRegime.totalTax)}.`,
  });
  steps.push({
    n: 6, title: "Choose the cheaper regime", ok: true, value: chosen.totalTax,
    detail: `${chosen.regimeLabel} costs ${inr(chosen.totalTax)}, which is ${inr(comparison.saving)} less than the alternative.`,
  });
  children.push(chosen.trace);

  if (regimeChosen === "old" && exemptAllowances === 0 && p.rentMonthly > 0) {
    warnings.push("You pay rent but no house rent allowance was exempted. Check item 2(a) of Form 16 Part B.");
  }
  if (regimeChosen === "new" && exemptAllowances > 0) {
    warnings.push("Exempt allowances are not available under the new regime, so they have not reduced your tax here.");
  }

  /* 7 ------------------------------------------------------- validate */
  const bandSum = chosen.bands.reduce((s, b) => s + b.taxInBand, 0);
  const cessOk = chosen.cess === Math.round(chosen.taxAfterRebate * RULES.cess.rate);
  const rebateOk = chosen.rebate87A <= chosen.taxBeforeRebate;
  const validated = bandSum === chosen.taxBeforeRebate && cessOk && rebateOk;
  steps.push({
    n: 7, title: "Check the arithmetic", ok: validated,
    detail: validated
      ? "The per-band tax sums to the pre-rebate total, the rebate does not exceed the tax it offsets, and the cess is correct."
      : "A validation check failed. The figures above should not be relied on.",
  });
  if (!validated) warnings.push("An internal validation check failed. Do not rely on these figures.");

  /* 8 ------------------------------------------ refund or balance payable */
  const refundDue = rupees(f.tdsDeducted - chosen.totalTax);
  steps.push({
    n: 8, title: "Compare against the tax already deducted", ok: true, value: refundDue,
    detail: refundDue > 0
      ? `Your employer deducted ${inr(f.tdsDeducted)} against a liability of ${inr(chosen.totalTax)}, so ${inr(refundDue)} is due back to you.`
      : refundDue < 0
        ? `Your employer deducted ${inr(f.tdsDeducted)} against a liability of ${inr(chosen.totalTax)}, so ${inr(-refundDue)} is still payable.`
        : `The tax deducted matches your liability exactly. Nothing is payable and nothing is refundable.`,
  });
  children.push({
    ruleId: "itr.refund", label: refundDue >= 0 ? "Refund due" : "Balance payable",
    inputs: { tdsDeducted: f.tdsDeducted, liability: chosen.totalTax }, output: refundDue,
  });

  /* ------------------------------------------------ the document itself */
  const itr: Record<string, unknown> = {
    _note: "Shaped like an ITR-1. Nothing has been submitted anywhere. Prepared locally for your own checking.",
    assessmentYear: f.assessmentYear,
    financialYear: RULES._meta.financialYear,
    governingAct: RULES._meta.governingAct,
    regimeOpted: chosen.regimeLabel,
    personalInfo: { name: p.name, occupation: p.occupation, city: p.city },
    employer: { name: f.employerName || "(not entered)", tan: f.employerTAN || "(not entered)" },
    salaryIncome: {
      grossSalary,
      exemptAllowancesSection10: exemptAllowances,
      professionalTaxSection16iii: professionalTax,
      standardDeduction: chosen.standardDeduction,
      netSalary: Math.max(0, grossSalary - exemptAllowances - professionalTax - chosen.standardDeduction),
    },
    otherIncome: {
      houseProperty: f.housePropertyIncome,
      otherSources: f.otherSourcesIncome,
    },
    grossTotalIncome: engineIncome,
    chapterVIADeductions: {
      claimed: chapterVIAClaimed,
      allowed: chosen.chapterVIA,
      breakdown: {
        "80C": f.deduction80C, "80D": f.deduction80D,
        "80CCD(1B)": f.deduction80CCD1B, "80TTA": f.deduction80TTA,
      },
    },
    totalIncome: chosen.taxableIncome,
    taxComputation: {
      taxOnTotalIncome: chosen.taxBeforeRebate,
      rebateSection87A: chosen.rebate87A,
      healthAndEducationCess: chosen.cess,
      totalTaxLiability: chosen.totalTax,
      slabs: chosen.bands.filter((b) => b.amountInBand > 0).map((b) => ({
        from: b.from, to: b.to, rate: b.rate,
        incomeInBand: b.amountInBand, taxInBand: b.taxInBand,
      })),
    },
    taxesPaid: { tdsOnSalary: f.tdsDeducted },
    refundDue: Math.max(0, refundDue),
    balancePayable: Math.max(0, -refundDue),
  };

  return {
    steps, regimeChosen, grossSalary, exemptAllowances,
    standardDeduction: chosen.standardDeduction,
    professionalTax,
    salaryIncome: Math.max(0, grossSalary - exemptAllowances - professionalTax),
    otherIncome,
    grossTotalIncome: engineIncome,
    chapterVIA: chosen.chapterVIA,
    totalIncome: chosen.taxableIncome,
    taxPayable: chosen.totalTax,
    tdsDeducted: f.tdsDeducted,
    refundDue,
    savingVsOtherRegime: comparison.saving,
    itr, warnings,
    trace: {
      ruleId: "itr.prepare",
      label: `Return prepared under the ${chosen.regimeLabel}`,
      inputs: { grossSalary, tdsDeducted: f.tdsDeducted },
      output: chosen.totalTax,
      children,
    },
  };
}

export { computeTax };

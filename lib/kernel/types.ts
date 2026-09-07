/**
 * Kernel types.
 *
 * Nothing in lib/kernel touches the network, React, or a language model.
 * That is what makes every figure here testable on its own.
 */

export type RegimeId = "new" | "old";
export type Occupation = "salaried" | "business" | "profession";

/**
 * One node of the verifiable trace.
 *
 * Every arithmetic step emits one of these as it runs, so the "show the
 * working" view is assembled from the computation itself rather than
 * reconstructed from the answer afterwards.
 */
export interface TraceNode {
  ruleId: string;
  label: string;
  inputs: Record<string, number | string>;
  output: number;
  children?: TraceNode[];
}

export interface Slab {
  from: number;
  to: number | null;
  rate: number;
}

export interface SlabBand extends Slab {
  amountInBand: number;
  taxInBand: number;
}

export type DeductionSection =
  | "80C" | "80D" | "80D_parents_senior" | "80CCD1B" | "24b" | "80E" | "80TTA";

export type Deductions = Partial<Record<DeductionSection, number>>;

export interface HRAInput {
  basicAnnual: number;
  hraReceivedAnnual: number;
  rentAnnual: number;
  isMetro: boolean;
}

export interface TaxInput {
  regime: RegimeId;
  grossIncome: number;
  isSalaried: boolean;
  deductions?: Deductions;
  hra?: HRAInput;
}

export interface TaxResult {
  regime: RegimeId;
  regimeLabel: string;
  grossIncome: number;
  standardDeduction: number;
  hraExemption: number;
  chapterVIA: number;
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  bands: SlabBand[];
  trace: TraceNode;
}

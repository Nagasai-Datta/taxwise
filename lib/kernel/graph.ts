import { computeTax } from "./tax";
import { computeHRAExemption } from "./hra";
import { RULES } from "./rules";
import { rupees } from "./money";
import type { TraceNode, RegimeId } from "./types";

/**
 * The causal finance graph.
 *
 * Every calculator runs forwards: change an input, watch the outputs move.
 * This runs both ways.
 *
 *   forward   "if I invest another 50,000 in 80C, what happens to my tax?"
 *   backward  "I want my tax to be 40,000. How much must I invest?"
 *
 * The backward direction is the part nothing on the market does, and it is the
 * reason the graph exists rather than being a diagram. It is solved by
 * bisection rather than algebra, because the section 87A rebate is a cliff:
 * tax drops to zero in a single step rather than tapering, and algebra steps
 * straight over a cliff without noticing it.
 *
 * Pure, like the rest of the kernel. No network, no model, no React. That is
 * also what lets the interface run it directly for a live slider preview: the
 * same function, the same rulebook, the same answer.
 */

export type NodeId =
  | "grossSalary" | "basicSalary" | "hraReceived" | "rentAnnual"
  | "d80C" | "d80D" | "d80CCD1B" | "d24b"
  | "hraExemption" | "standardDeduction" | "chapterVIA" | "taxableIncome"
  | "taxBeforeRebate" | "rebate87A" | "cess" | "totalTax"
  | "netIncome" | "annualSpending" | "annualSaving" | "savingsRate";

export interface GraphNode {
  id: NodeId;
  label: string;
  kind: "input" | "derived";
  /** What this node is computed from. Empty for inputs. */
  from: NodeId[];
  /** Inputs only: the range a slider may cover. */
  min?: number;
  max?: number;
  step?: number;
  /** A percentage rather than a rupee amount. */
  isRate?: boolean;
  explain: string;
}

export const NODES: GraphNode[] = [
  { id: "grossSalary", label: "Gross salary", kind: "input", from: [], min: 0, max: 5000000, step: 25000,
    explain: "Everything your employer pays you before anything is taken off." },
  { id: "basicSalary", label: "Basic salary", kind: "input", from: [], min: 0, max: 2500000, step: 10000,
    explain: "The core component. Several rules are a percentage of this rather than of the whole." },
  { id: "hraReceived", label: "HRA received", kind: "input", from: [], min: 0, max: 1500000, step: 10000,
    explain: "The rent allowance component of your salary, as paid." },
  { id: "rentAnnual", label: "Rent paid", kind: "input", from: [], min: 0, max: 1200000, step: 12000,
    explain: "What you actually pay your landlord across the year." },
  { id: "d80C", label: "80C investments", kind: "input", from: [], min: 0, max: 150000, step: 5000,
    explain: "Provident fund, ELSS, life insurance, tuition fees, home loan principal." },
  { id: "d80D", label: "80D health insurance", kind: "input", from: [], min: 0, max: 75000, step: 2500,
    explain: "Premiums for yourself, your family and your parents." },
  { id: "d80CCD1B", label: "80CCD(1B) pension", kind: "input", from: [], min: 0, max: 50000, step: 5000,
    explain: "Additional pension contribution, over and above the 80C ceiling." },
  { id: "d24b", label: "Home loan interest", kind: "input", from: [], min: 0, max: 200000, step: 10000,
    explain: "Interest on a loan for a property you live in, under section 24(b)." },

  { id: "hraExemption", label: "HRA exemption", kind: "derived", from: ["basicSalary", "hraReceived", "rentAnnual"],
    explain: "The least of three amounts: what you received, a share of basic, and rent minus a tenth of basic." },
  { id: "standardDeduction", label: "Standard deduction", kind: "derived", from: ["grossSalary"],
    explain: "A fixed amount subtracted from salary, with no proof required." },
  { id: "chapterVIA", label: "Chapter VI-A deductions", kind: "derived", from: ["d80C", "d80D", "d80CCD1B", "d24b"],
    explain: "Your investment deductions, each trimmed to its own ceiling." },
  { id: "taxableIncome", label: "Taxable income", kind: "derived",
    from: ["grossSalary", "standardDeduction", "hraExemption", "chapterVIA"],
    explain: "What is left after everything allowed has been subtracted. The slabs apply to this." },
  { id: "taxBeforeRebate", label: "Tax before rebate", kind: "derived", from: ["taxableIncome"],
    explain: "The slab table walked band by band." },
  { id: "rebate87A", label: "Section 87A rebate", kind: "derived", from: ["taxableIncome", "taxBeforeRebate"],
    explain: "A relief that cancels the tax entirely below a threshold. A cliff, not a slope." },
  { id: "cess", label: "Health and education cess", kind: "derived", from: ["taxBeforeRebate", "rebate87A"],
    explain: "Charged on the tax after the rebate, not on income." },
  { id: "totalTax", label: "Total tax", kind: "derived", from: ["taxBeforeRebate", "rebate87A", "cess"],
    explain: "What you actually owe." },
  { id: "netIncome", label: "Net income", kind: "derived", from: ["grossSalary", "totalTax"],
    explain: "What reaches you across the year after tax." },
  { id: "annualSpending", label: "Annual spending", kind: "input", from: [], min: 0, max: 3000000, step: 25000,
    explain: "What you spend across the year, from your transactions." },
  { id: "annualSaving", label: "Annual saving", kind: "derived", from: ["netIncome", "annualSpending"],
    explain: "What survives the year." },
  { id: "savingsRate", label: "Savings rate", kind: "derived", from: ["annualSaving", "netIncome"], isRate: true,
    explain: "The share of net income you keep. More useful than the amount, because it survives a pay rise." },
];

export const NODE_BY_ID: Record<string, GraphNode> =
  Object.fromEntries(NODES.map((n) => [n.id, n]));

export type GraphInputs = Record<string, number>;
export type GraphValues = Record<NodeId, number>;

/** The inputs a slider may move. */
export const LEVERS: NodeId[] =
  ["grossSalary", "rentAnnual", "d80C", "d80D", "d80CCD1B", "d24b", "annualSpending"];

/* ------------------------------------------------------------- forward */

/**
 * Compute every derived node from the inputs.
 *
 * The tax figures come from `computeTax`, the same function the Computation
 * agent uses, so the graph cannot drift away from what the rest of the system
 * would say.
 */
export function propagateGraph(inputs: GraphInputs, regime: RegimeId = "old"): {
  values: GraphValues;
  regime: RegimeId;
  trace: TraceNode;
} {
  const i = (k: NodeId) => Math.max(0, Math.round(inputs[k] ?? 0));

  const hra = i("hraReceived") > 0 && i("basicSalary") > 0 && regime === "old"
    ? computeHRAExemption({
        basicAnnual: i("basicSalary"),
        hraReceivedAnnual: i("hraReceived"),
        rentAnnual: i("rentAnnual"),
        isMetro: (inputs.isMetro ?? 0) === 1,
      }).exemption
    : 0;

  const r = computeTax({
    regime,
    grossIncome: i("grossSalary"),
    isSalaried: true,
    deductions: regime === "old" ? {
      "80C": i("d80C"), "80D": i("d80D"),
      "80CCD1B": i("d80CCD1B"), "24b": i("d24b"),
    } : undefined,
    hra: regime === "old" && i("hraReceived") > 0 ? {
      basicAnnual: i("basicSalary"),
      hraReceivedAnnual: i("hraReceived"),
      rentAnnual: i("rentAnnual"),
      isMetro: (inputs.isMetro ?? 0) === 1,
    } : undefined,
  });

  const netIncome = Math.max(0, rupees(i("grossSalary") - r.totalTax));
  const annualSaving = Math.max(0, rupees(netIncome - i("annualSpending")));

  const values: GraphValues = {
    grossSalary: i("grossSalary"),
    basicSalary: i("basicSalary"),
    hraReceived: i("hraReceived"),
    rentAnnual: i("rentAnnual"),
    d80C: i("d80C"), d80D: i("d80D"), d80CCD1B: i("d80CCD1B"), d24b: i("d24b"),
    hraExemption: regime === "old" ? r.hraExemption : hra * 0,
    standardDeduction: r.standardDeduction,
    chapterVIA: r.chapterVIA,
    taxableIncome: r.taxableIncome,
    taxBeforeRebate: r.taxBeforeRebate,
    rebate87A: r.rebate87A,
    cess: r.cess,
    totalTax: r.totalTax,
    netIncome,
    annualSpending: i("annualSpending"),
    annualSaving,
    savingsRate: netIncome > 0 ? Math.round((annualSaving / netIncome) * 10000) / 100 : 0,
  };

  return { values, regime, trace: r.trace };
}

/* ------------------------------------------------------------ backward */

export interface InverseResult {
  /** Whether the target is reachable at all by moving this lever. */
  achievable: boolean;
  lever: NodeId;
  leverLabel: string;
  target: NodeId;
  targetLabel: string;
  targetValue: number;
  /** The lever value that gets closest. */
  requiredLever: number;
  /** What the target actually becomes at that lever value. */
  achievedValue: number;
  /** Where the lever started. */
  currentLever: number;
  currentValue: number;
  /** How much the lever has to move. */
  change: number;
  atCeiling: boolean;
  iterations: number;
  explanation: string;
}

/**
 * Solve for the lever value that brings a target to a wanted figure.
 *
 * Bisection over the lever's permitted range, 40 iterations, which resolves a
 * 150,000 range to well under a rupee. It assumes the target moves
 * monotonically with the lever, which every pairing here satisfies: more
 * deduction never raises tax, more spending never raises saving.
 *
 * Algebra would be faster and wrong. The 87A rebate makes tax a step function
 * near the threshold, so an algebraic inverse can return a value on the far
 * side of a cliff it never noticed. Bisection converges on the boundary
 * instead, which is the honest answer.
 */
export function invertGraph(args: {
  inputs: GraphInputs;
  lever: NodeId;
  target: NodeId;
  targetValue: number;
  regime?: RegimeId;
}): InverseResult {
  const { inputs, lever, target, targetValue } = args;
  const regime = args.regime ?? "old";

  const leverNode = NODE_BY_ID[lever];
  const targetNode = NODE_BY_ID[target];
  const lo0 = leverNode?.min ?? 0;
  const hi0 = leverNode?.max ?? 1000000;

  const evaluate = (v: number): number =>
    propagateGraph({ ...inputs, [lever]: v }, regime).values[target];

  const currentLever = Math.max(0, Math.round(inputs[lever] ?? 0));
  const currentValue = evaluate(currentLever);

  const atLo = evaluate(lo0);
  const atHi = evaluate(hi0);
  const increasing = atHi > atLo;

  // Outside the range the lever can reach, no amount of moving it will do.
  const reachableMin = Math.min(atLo, atHi);
  const reachableMax = Math.max(atLo, atHi);
  const achievable = targetValue >= reachableMin - 1 && targetValue <= reachableMax + 1;

  let lo = lo0, hi = hi0, iterations = 0;
  for (; iterations < 40; iterations++) {
    const mid = (lo + hi) / 2;
    const v = evaluate(mid);
    if (Math.abs(v - targetValue) < 0.5) { lo = hi = mid; break; }
    if (increasing ? v < targetValue : v > targetValue) lo = mid;
    else hi = mid;
  }

  const requiredLever = Math.round((lo + hi) / 2);
  const achievedValue = evaluate(requiredLever);
  const atCeiling = requiredLever >= hi0 - 1 || requiredLever <= lo0 + 1;

  const fmt = (n: number) => targetNode?.isRate ? `${n}%` : `\u20B9${Math.round(n).toLocaleString("en-IN")}`;
  const lev = (n: number) => `\u20B9${Math.round(n).toLocaleString("en-IN")}`;

  let explanation: string;
  if (!achievable) {
    explanation =
      `${targetNode?.label ?? target} cannot reach ${fmt(targetValue)} by changing ` +
      `${leverNode?.label ?? lever} alone. Across its whole range the best it manages is ` +
      `${fmt(increasing ? reachableMax : reachableMin)}.`;
  } else if (atCeiling) {
    explanation =
      `${leverNode?.label ?? lever} would have to reach ${lev(requiredLever)}, which is the ` +
      `limit of what the rules allow. At that point ${targetNode?.label ?? target} becomes ` +
      `${fmt(achievedValue)}.`;
  } else {
    const delta = requiredLever - currentLever;
    explanation =
      `${leverNode?.label ?? lever} would need to be ${lev(requiredLever)}, which is ` +
      `${delta >= 0 ? `${lev(Math.abs(delta))} more` : `${lev(Math.abs(delta))} less`} than now. ` +
      `${targetNode?.label ?? target} would move from ${fmt(currentValue)} to ${fmt(achievedValue)}.`;
  }

  return {
    achievable, lever, leverLabel: leverNode?.label ?? lever,
    target, targetLabel: targetNode?.label ?? target, targetValue,
    requiredLever, achievedValue, currentLever, currentValue,
    change: requiredLever - currentLever, atCeiling, iterations, explanation,
  };
}

/** Ceilings, so a slider cannot be dragged past what the law allows. */
export function leverCeiling(id: NodeId): number | null {
  const caps: Partial<Record<NodeId, number | null>> = {
    d80C: RULES.deductions["80C"].cap,
    d80D: RULES.deductions["80D"].cap,
    d80CCD1B: RULES.deductions["80CCD1B"].cap,
    d24b: RULES.deductions["24b"].cap,
  };
  return caps[id] ?? null;
}

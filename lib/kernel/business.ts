import { RULES } from "./rules";
import type { TraceNode } from "./types";
import { inr, pct, rupees } from "./money";

/* ------------------------------------------------------------------ GST */

export interface GSTResult {
  taxableTurnover: number;
  exportTurnover: number;
  outputGST: number;
  inputTaxCredit: number;
  netGSTPayable: number;
  registrationRequired: boolean;
  registrationThreshold: number;
  headroomToThreshold: number;
  trace: TraceNode;
}

/**
 * GST for a service provider.
 *
 * You charge GST to Indian customers and pass it to the government. GST you
 * paid on your own business expenses comes off that as input tax credit.
 * Exports are zero-rated: no GST charged, but the credit is still claimable.
 */
export function computeGST(args: {
  domesticTurnover: number;
  exportTurnover: number;
  gstPaidOnExpenses: number;
}): GSTResult {
  const { domesticTurnover, exportTurnover, gstPaidOnExpenses } = args;
  const rate = RULES.gst.standardServiceRate;
  const threshold = RULES.gst.serviceRegistrationThreshold;
  const totalTurnover = domesticTurnover + exportTurnover;

  const outputGST = rupees(domesticTurnover * rate);
  const netGSTPayable = Math.max(0, outputGST - gstPaidOnExpenses);
  const registrationRequired = totalTurnover > threshold;

  return {
    taxableTurnover: domesticTurnover,
    exportTurnover,
    outputGST,
    inputTaxCredit: gstPaidOnExpenses,
    netGSTPayable,
    registrationRequired,
    registrationThreshold: threshold,
    headroomToThreshold: Math.max(0, threshold - totalTurnover),
    trace: {
      ruleId: "gst.net_liability",
      label: "Net GST payable is the GST you charged customers less the GST you already paid on business expenses",
      inputs: { domesticTurnover, exportTurnover, rate },
      output: netGSTPayable,
      children: [
        {
          ruleId: "gst.output",
          label: `${pct(rate)} charged on domestic turnover of ${inr(domesticTurnover)}`,
          inputs: { domesticTurnover, rate },
          output: outputGST,
        },
        {
          ruleId: "gst.exports_zero_rated",
          label: `Exports of ${inr(exportTurnover)} are zero-rated, so no GST is charged on them`,
          inputs: { exportTurnover },
          output: 0,
        },
        {
          ruleId: "gst.input_credit",
          label: "Input tax credit for GST already paid on business expenses",
          inputs: {},
          output: -gstPaidOnExpenses,
        },
        {
          ruleId: "gst.registration",
          label: registrationRequired
            ? `Turnover of ${inr(totalTurnover)} is above the ${inr(threshold)} threshold, so registration is required`
            : `Turnover of ${inr(totalTurnover)} is below the ${inr(threshold)} threshold, with ${inr(threshold - totalTurnover)} of headroom left`,
          inputs: { totalTurnover, threshold },
          output: totalTurnover,
        },
      ],
    },
  };
}

/* --------------------------------------------------- presumptive taxation */

export interface PresumptiveOption {
  method: "presumptive" | "books";
  scheme: string | null;
  declaredProfit: number;
  basis: string;
  eligible: boolean;
  reason: string;
}

export interface PresumptiveComparison {
  options: PresumptiveOption[];
  recommended: "presumptive" | "books";
  profitDifference: number;
  trace: TraceNode;
  caveats: string[];
}

/**
 * Presumptive taxation, sections 44AD and 44ADA.
 *
 * Normally a business counts every rupee of income and expense and pays tax
 * on the difference. Presumptive taxation skips all that: profit is DEEMED to
 * be a fixed share of turnover, and no books are required.
 *
 * Whether it helps depends entirely on whether actual profit sits above or
 * below that deemed share. This computes both and reports the lower declared
 * profit, along with the conditions that make the scheme unavailable.
 */
export function presumptiveVsBooks(args: {
  occupation: "business" | "profession";
  turnover: number;
  actualExpenses: number;
  digitalReceiptShare: number;
}): PresumptiveComparison {
  const { occupation, turnover, actualExpenses, digitalReceiptShare } = args;
  const p = RULES.presumptive;

  const actualProfit = Math.max(0, rupees(turnover - actualExpenses));

  let scheme: string;
  let deemedRate: number;
  let digitalPart = turnover;
  let ceiling: number;
  let rateBasis: string;

  if (occupation === "profession") {
    scheme = "44ADA";
    deemedRate = p["44ADA"].deemedRate;
    ceiling = p["44ADA"].receiptsCeiling;
    rateBasis = `${pct(deemedRate)} of gross receipts`;
  } else {
    scheme = "44AD";
    // Section 44AD(1): the lower rate applies only to the part of turnover
    // received through banking or electronic channels. Everything else is
    // deemed at the higher rate. A single rate for the whole turnover
    // understated profit whenever any receipt was not digital.
    const share = Math.min(1, Math.max(0, digitalReceiptShare));
    digitalPart = rupees(turnover * share);
    const cashPart = turnover - digitalPart;
    const rD = p["44AD"].deemedRateDigital;
    const rC = p["44AD"].deemedRateCash;
    deemedRate = turnover > 0 ? (digitalPart * rD + cashPart * rC) / turnover : rD;
    ceiling = p["44AD"].turnoverCeiling;
    rateBasis = cashPart > 0
      ? `${pct(rD)} of ${inr(digitalPart)} received digitally, plus ${pct(rC)} of ${inr(cashPart)} received otherwise`
      : `${pct(rD)} of turnover, all of it received digitally`;
  }

  const deemedProfit = scheme === "44AD"
    ? rupees(digitalPart * p["44AD"].deemedRateDigital) + rupees((turnover - digitalPart) * p["44AD"].deemedRateCash)
    : rupees(turnover * deemedRate);
  const eligible = turnover <= ceiling;

  const options: PresumptiveOption[] = [
    {
      method: "presumptive",
      scheme,
      declaredProfit: deemedProfit,
      basis: rateBasis,
      eligible,
      reason: eligible
        ? `Turnover of ${inr(turnover)} is within the ${inr(ceiling)} ceiling for section ${scheme}.`
        : `Turnover of ${inr(turnover)} exceeds the ${inr(ceiling)} ceiling, so section ${scheme} is not available.`,
    },
    {
      method: "books",
      scheme: null,
      declaredProfit: actualProfit,
      basis: "actual turnover less actual business expenses",
      eligible: true,
      reason: "Regular books are always available, but require records of every expense.",
    },
  ];

  const recommended: "presumptive" | "books" =
    eligible && deemedProfit < actualProfit ? "presumptive" : "books";

  const caveats: string[] = [];
  if (recommended === "presumptive") {
    caveats.push("Business expenses cannot be claimed separately once a presumptive scheme is used.");
    caveats.push("Advance tax under a presumptive scheme is paid in one instalment by 15 March.");
    if (scheme === "44AD") {
      caveats.push(`Opting out of section 44AD later locks the scheme for the next ${p["44AD"].lockInYears} tax years.`);
    }
  }

  return {
    options,
    recommended,
    profitDifference: Math.abs(deemedProfit - actualProfit),
    caveats,
    trace: {
      ruleId: `presumptive.${scheme}`,
      label: `Declared profit under section ${scheme} compared against regular books`,
      inputs: { turnover, actualExpenses, deemedRate },
      output: recommended === "presumptive" ? deemedProfit : actualProfit,
      children: [
        {
          ruleId: `presumptive.${scheme}.deemed`,
          label: `Presumptive: ${rateBasis}`,
          inputs: { turnover, deemedRate },
          output: deemedProfit,
        },
        {
          ruleId: "presumptive.books.actual",
          label: `Regular books: ${inr(turnover)} turnover less ${inr(actualExpenses)} of expenses`,
          inputs: { turnover, actualExpenses },
          output: actualProfit,
        },
        {
          ruleId: `presumptive.${scheme}.eligibility`,
          label: eligible
            ? `Eligible: turnover is within the ${inr(ceiling)} ceiling`
            : `Not eligible: turnover is above the ${inr(ceiling)} ceiling`,
          inputs: { turnover, ceiling },
          output: eligible ? 1 : 0,
        },
      ],
    },
  };
}

/* ------------------------------------------------------------ advance tax */

export interface AdvanceTaxInstalment {
  dueDate: string;
  cumulativePercent: number;
  cumulativeAmount: number;
  instalmentAmount: number;
}

export interface AdvanceTaxResult {
  required: boolean;
  totalLiability: number;
  minimumLiability: number;
  instalments: AdvanceTaxInstalment[];
  trace: TraceNode;
}

/**
 * Advance tax. If your yearly liability crosses the minimum, you must pay it
 * across the year rather than in one go at the end. A taxpayer under a
 * presumptive scheme pays the whole amount in a single March instalment.
 */
export function computeAdvanceTax(args: {
  totalLiability: number;
  underPresumptiveScheme: boolean;
}): AdvanceTaxResult {
  const { totalLiability, underPresumptiveScheme } = args;
  const minimum = RULES.advanceTax.minimumLiability;
  const required = totalLiability > minimum;

  const schedule = underPresumptiveScheme
    ? RULES.advanceTax.presumptiveSchedule
    : RULES.advanceTax.schedule;

  const instalments: AdvanceTaxInstalment[] = [];
  let paidSoFar = 0;
  for (const s of schedule) {
    const cumulativeAmount = required ? rupees(totalLiability * s.cumulativePercent) : 0;
    instalments.push({
      dueDate: s.dueDate,
      cumulativePercent: s.cumulativePercent,
      cumulativeAmount,
      instalmentAmount: cumulativeAmount - paidSoFar,
    });
    paidSoFar = cumulativeAmount;
  }

  return {
    required,
    totalLiability,
    minimumLiability: minimum,
    instalments,
    trace: {
      ruleId: "advance_tax",
      label: required
        ? `Advance tax is due because the liability of ${inr(totalLiability)} exceeds ${inr(minimum)}`
        : `No advance tax is due: the liability of ${inr(totalLiability)} is at or below ${inr(minimum)}`,
      inputs: { totalLiability, minimum, presumptive: underPresumptiveScheme ? "yes" : "no" },
      output: required ? totalLiability : 0,
      children: instalments.map((i) => ({
        ruleId: `advance_tax.${i.dueDate.replace(/\s/g, "_")}`,
        label: `By ${i.dueDate}, ${pct(i.cumulativePercent)} of the liability must have been paid`,
        inputs: { cumulativePercent: i.cumulativePercent },
        output: i.cumulativeAmount,
      })),
    },
  };
}

/* ------------------------------------------------------- 194J and calendar */

export function compute194J(grossReceipts: number): { rate: number; expectedTDS: number; note: string } {
  const rate = RULES.tds["194J"].rate;
  return {
    rate,
    expectedTDS: rupees(grossReceipts * rate),
    note: `Clients deduct ${pct(rate)} from professional fees and pay it to the government on your behalf. You claim it back when you file.`,
  };
}

export function getApplicableDeadlines(args: {
  occupation: "salaried" | "business" | "profession";
  gstRegistered: boolean;
}) {
  const tags = new Set<string>([args.occupation]);
  if (args.gstRegistered) tags.add("gst_registered");
  return RULES.calendar.filter((e) => (e.appliesTo as string[]).some((t) => tags.has(t)));
}

import catalogue from "@/data/investments.json";
import { computeTax } from "./tax";
import { RULES, deductionMeta } from "./rules";
import { inr, rupees } from "./money";
import type { Deductions, TraceNode } from "./types";
import type { Profile } from "./profiles";

/* ==================================================== investment comparison */

export interface InvestmentOption {
  id: string;
  name: string;
  section: string;
  lockInYears: number | null;
  lockInNote: string;
  character: string;
  risk: string;
  taxOnMaturity: string;
  suits: string;
}

export const OPTIONS = catalogue.options as InvestmentOption[];

export interface ComparedOption extends InvestmentOption {
  /** Headroom left under this option's section. */
  headroom: number;
  ceiling: number | null;
  /** Actual rupee tax saved by filling that headroom, from the engine. */
  taxSavedIfFilled: number;
  eligible: boolean;
  reason: string;
}

export interface InvestmentComparison {
  baselineTax: number;
  regime: "old";
  options: ComparedOption[];
  sharedCeilingNote: string;
  caveat: string;
}

/**
 * Comparing where to put money for a deduction.
 *
 * Two kinds of fact, kept apart on purpose.
 *
 * What the LAW fixes is knowable: which section, how long it is locked, how the
 * payout is taxed. That comes from the catalogue.
 *
 * What it SAVES is computable: the engine is re-run with the section filled to
 * its ceiling, exactly as the deduction optimiser does, so the figure respects
 * slab boundaries and the section 87A cliff.
 *
 * What it RETURNS is neither. No return figure appears anywhere in the
 * catalogue or in this function, because a return is a forecast and this system
 * does not present forecasts as facts. A comparison that ranked options by an
 * assumed return would be the most confident and least defensible thing here.
 */
export function compareInvestments(args: {
  grossIncome: number;
  isSalaried: boolean;
  deductions: Deductions;
  hra?: { basicAnnual: number; hraReceivedAnnual: number; rentAnnual: number; isMetro: boolean };
}): InvestmentComparison {
  const baseInput = {
    grossIncome: args.grossIncome,
    isSalaried: args.isSalaried,
    deductions: args.deductions,
    hra: args.hra,
  };
  const baseline = computeTax({ ...baseInput, regime: "old" });

  const options: ComparedOption[] = OPTIONS.map((o) => {
    const meta = deductionMeta(o.section);
    const ceiling = meta?.cap ?? null;
    const claimed = (args.deductions as Record<string, number>)[o.section] ?? 0;
    const headroom = ceiling === null ? 0 : Math.max(0, ceiling - claimed);

    let taxSavedIfFilled = 0;
    if (headroom > 0 && ceiling !== null) {
      const filled = { ...(args.deductions ?? {}) } as Record<string, number>;
      filled[o.section] = ceiling;
      const after = computeTax({ ...baseInput, regime: "old", deductions: filled as Deductions });
      taxSavedIfFilled = baseline.totalTax - after.totalTax;
    }

    return {
      ...o, headroom, ceiling, taxSavedIfFilled,
      eligible: headroom > 0,
      reason: headroom > 0
        ? `${inr(headroom)} of the ${o.section} ceiling is unused.`
        : `The ${o.section} ceiling is already full, so another rupee here saves nothing.`,
    };
  });

  return {
    baselineTax: baseline.totalTax,
    regime: "old",
    options,
    sharedCeilingNote:
      `Everything under 80C shares one ceiling of ${inr(RULES.deductions["80C"].cap ?? 0)}. ` +
      "Filling one leaves less room for the others, so the saving shown for each assumes " +
      "you fill that one and not the rest. 80CCD(1B) and 80D have their own separate ceilings.",
    caveat:
      "These are compared on what the law fixes, which is the section, the lock-in and the tax " +
      "treatment, and on the tax saved, which the engine computes. They are not compared on " +
      "returns, because a return is a forecast rather than a rule.",
  };
}

/* ============================================================== invoicing */

export interface InvoiceInput {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  clientAddress: string;
  clientGSTIN: string;
  description: string;
  amount: number;
  /** Whether GST is charged. Exports are zero-rated. */
  chargeGST: boolean;
  isExport: boolean;
  placeOfSupply: string;
  notes: string;
}

export interface InvoiceLine {
  label: string;
  value: number;
  note?: string;
}

export interface InvoiceResult {
  header: {
    number: string; date: string;
    from: { name: string; city: string };
    to: { name: string; address: string; gstin: string };
  };
  description: string;
  lines: InvoiceLine[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  tdsExpected: number;
  expectedReceipt: number;
  notes: string[];
  document: Record<string, unknown>;
  trace: TraceNode;
}

/**
 * An invoice, with the two things people get wrong made explicit.
 *
 * GST is added ON TOP of the fee and passed to the government. It is never
 * income, and treating it as income is the most common mistake a new
 * freelancer makes.
 *
 * TDS is deducted BY THE CLIENT before paying. It is not a cost either: it is
 * tax already paid on your behalf, which you claim back when you file. So the
 * amount that actually arrives is neither the fee nor the invoice total, and
 * this says which is which.
 */
export function buildInvoice(input: InvoiceInput, p: Profile): InvoiceResult {
  const subtotal = rupees(input.amount);
  const gstRate = RULES.gst.standardServiceRate;
  const charge = input.chargeGST && !input.isExport;
  const gstAmount = charge ? rupees(subtotal * gstRate) : 0;
  const total = subtotal + gstAmount;

  // Clients deduct TDS on the fee, not on the GST.
  const tdsRate = RULES.tds["194J"].rate;
  /**
   * Section 194J obliges an Indian payer. A client outside India has no such
   * obligation and deducts nothing, so an export invoice arrives in full.
   * Measured: an export invoice was showing a deduction that would never
   * happen, which understated the receipt by the whole TDS amount.
   */
  const applies =
    p.occupation === "profession" &&
    !input.isExport &&
    subtotal >= RULES.tds["194J"].thresholdAnnual;
  const tdsExpected = applies ? rupees(subtotal * tdsRate) : 0;
  const expectedReceipt = total - tdsExpected;

  const lines: InvoiceLine[] = [
    { label: "Professional fee", value: subtotal },
  ];
  if (charge) {
    lines.push({ label: `GST at ${Math.round(gstRate * 100)}%`, value: gstAmount, note: "collected on behalf of the government" });
  } else if (input.isExport) {
    lines.push({ label: "GST", value: 0, note: "zero-rated: this is an export of services" });
  }

  const notes: string[] = [];
  if (charge) {
    notes.push("The GST on this invoice is not your income. You collect it and pass it on, and you may set off GST you paid on your own expenses against it.");
  }
  if (input.isExport) {
    notes.push("Exports are zero-rated, so no GST is charged. The value still counts towards the registration threshold.");
  }
  if (tdsExpected > 0) {
    notes.push(`The client will deduct ${inr(tdsExpected)} as TDS under section 194J before paying. That is not a cost: it is tax paid on your behalf, which you claim when you file.`);
  }
  if (!input.invoiceNumber.trim()) {
    notes.push("An invoice needs a number, and the sequence should have no gaps. Gaps invite questions later.");
  }

  const document: Record<string, unknown> = {
    _note: "Prepared locally. Nothing has been sent to anyone.",
    invoice: { number: input.invoiceNumber || "(not set)", date: input.invoiceDate },
    from: { name: p.name, city: p.city, occupation: p.occupation },
    to: {
      name: input.clientName || "(not set)",
      address: input.clientAddress || "",
      gstin: input.clientGSTIN || "",
    },
    placeOfSupply: input.placeOfSupply || (input.isExport ? "Outside India" : p.city),
    description: input.description,
    amounts: {
      professionalFee: subtotal,
      gstRate: charge ? gstRate : 0,
      gst: gstAmount,
      invoiceTotal: total,
      tdsTheClientWillDeduct: tdsExpected,
      amountYouShouldReceive: expectedReceipt,
    },
    notes,
  };

  return {
    header: {
      number: input.invoiceNumber || "(not set)",
      date: input.invoiceDate,
      from: { name: p.name, city: p.city },
      to: { name: input.clientName || "(not set)", address: input.clientAddress, gstin: input.clientGSTIN },
    },
    description: input.description,
    lines, subtotal, gstRate: charge ? gstRate : 0, gstAmount, total,
    tdsExpected, expectedReceipt, notes, document,
    trace: {
      ruleId: "invoice.total",
      label: "What the client owes, and what will actually arrive",
      inputs: { fee: subtotal, gstCharged: charge ? "yes" : "no" },
      output: expectedReceipt,
      children: [
        { ruleId: "invoice.fee", label: "Professional fee", inputs: {}, output: subtotal },
        { ruleId: "invoice.gst", label: charge ? `GST at ${Math.round(gstRate * 100)}%` : "No GST charged", inputs: { rate: charge ? gstRate : 0 }, output: gstAmount },
        { ruleId: "invoice.total", label: "Invoice total", inputs: {}, output: total },
        { ruleId: "invoice.tds", label: tdsExpected > 0 ? "TDS the client deducts under section 194J" : "No TDS expected", inputs: { rate: applies ? tdsRate : 0 }, output: -tdsExpected },
      ],
    },
  };
}

/** Today, and a suggested next number, so the form starts somewhere sensible. */
export function invoiceDefaults(now = new Date()) {
  const y = now.getFullYear();
  const fyStart = now.getMonth() >= 3 ? y : y - 1;
  return {
    invoiceDate: now.toISOString().slice(0, 10),
    invoiceNumber: `INV-${String(fyStart).slice(2)}${String(fyStart + 1).slice(2)}-001`,
  };
}

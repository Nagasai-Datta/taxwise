import { describe, it, expect } from "vitest";
import { OPTIONS, compareInvestments, buildInvoice, invoiceDefaults } from "@/lib/kernel/advisory";
import { getProfile, toTaxInput } from "@/lib/kernel/profiles";
import { RULES, deductionMeta } from "@/lib/kernel/rules";
import { callTool } from "@/lib/kernel/tools/execute";
import { ago } from "@/lib/kernel/daemons";

const priya = getProfile("PRIYA-001")!;
const rohan = getProfile("ROHAN-003")!;

describe("the investment catalogue", () => {
  it("names only sections the rulebook knows", () => {
    for (const o of OPTIONS) expect(deductionMeta(o.section)).toBeDefined();
  });

  it("carries no return figure anywhere, which is the point", () => {
    const text = JSON.stringify(OPTIONS);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(%|per cent|percent)/i);
    expect(text).not.toMatch(/\breturns? of\b/i);
  });

  it("says what the law fixes about every option", () => {
    for (const o of OPTIONS) {
      expect(o.lockInNote.length).toBeGreaterThan(4);
      expect(o.taxOnMaturity.length).toBeGreaterThan(4);
      expect(o.suits.length).toBeGreaterThan(20);
    }
  });
});

describe("comparing where a deduction could go", () => {
  const base = toTaxInput(priya);
  const c = compareInvestments({
    grossIncome: base.grossIncome, isSalaried: base.isSalaried,
    deductions: base.deductions ?? {}, hra: base.hra,
  });

  it("measures the saving by re-running the engine, not by a marginal rate", () => {
    for (const o of c.options) expect(o.taxSavedIfFilled).toBeGreaterThanOrEqual(0);
    const c80 = c.options.find((o) => o.section === "80C")!;
    expect(c80.headroom).toBe((RULES.deductions["80C"].cap ?? 0) - (priya.deductions["80C"] ?? 0));
  });

  it("gives every 80C option the same saving, because they share one ceiling", () => {
    const saves = c.options.filter((o) => o.section === "80C" && o.eligible).map((o) => o.taxSavedIfFilled);
    expect(new Set(saves).size).toBe(1);
  });

  it("says so, rather than leaving the shared ceiling to be discovered", () => {
    expect(c.sharedCeilingNote).toMatch(/shares one ceiling/i);
  });

  it("marks an option with no headroom as saving nothing", () => {
    const full = compareInvestments({
      grossIncome: base.grossIncome, isSalaried: true,
      deductions: { "80C": RULES.deductions["80C"].cap ?? 0 },
    });
    const c80 = full.options.find((o) => o.section === "80C")!;
    expect(c80.eligible).toBe(false);
    expect(c80.taxSavedIfFilled).toBe(0);
  });

  it("states plainly that returns are not being compared", () => {
    expect(c.caveat).toMatch(/not compared on\s+returns|not compared on returns/i);
  });
});

describe("an invoice", () => {
  const input = {
    invoiceNumber: "INV-2627-001", invoiceDate: "2026-09-17",
    clientName: "Northwind Ltd", clientAddress: "Pune", clientGSTIN: "",
    description: "Brand identity work", amount: 100000,
    chargeGST: true, isExport: false, placeOfSupply: "Pune", notes: "",
  };

  it("adds GST on top of the fee rather than taking it out", () => {
    const inv = buildInvoice(input, rohan);
    expect(inv.subtotal).toBe(100000);
    expect(inv.gstAmount).toBe(Math.round(100000 * RULES.gst.standardServiceRate));
    expect(inv.total).toBe(inv.subtotal + inv.gstAmount);
  });

  it("charges no GST on an export, and says why", () => {
    const inv = buildInvoice({ ...input, isExport: true }, rohan);
    expect(inv.gstAmount).toBe(0);
    expect(inv.notes.join(" ")).toMatch(/zero-rated/i);
    expect(inv.notes.join(" ")).toMatch(/registration threshold/i);
  });

  it("deducts TDS from the fee, not from the GST", () => {
    const inv = buildInvoice(input, rohan);
    expect(inv.tdsExpected).toBe(Math.round(100000 * RULES.tds["194J"].rate));
  });

  it("works out what will actually arrive, which is neither the fee nor the total", () => {
    const inv = buildInvoice(input, rohan);
    expect(inv.expectedReceipt).toBe(inv.total - inv.tdsExpected);
    expect(inv.expectedReceipt).not.toBe(inv.subtotal);
    expect(inv.expectedReceipt).not.toBe(inv.total);
  });

  it("explains that collected GST is not income", () => {
    expect(buildInvoice(input, rohan).notes.join(" ")).toMatch(/not your income/i);
  });

  it("expects no TDS for a business owner, since 194J is professional fees", () => {
    const arjun = getProfile("ARJUN-002")!;
    expect(buildInvoice(input, arjun).tdsExpected).toBe(0);
  });

  it("warns when the invoice has no number", () => {
    expect(buildInvoice({ ...input, invoiceNumber: "" }, rohan).notes.join(" ")).toMatch(/no gaps/i);
  });

  it("produces a document that says nothing was sent", () => {
    const doc = buildInvoice(input, rohan).document as Record<string, unknown>;
    expect(String(doc._note)).toMatch(/nothing has been sent/i);
  });

  it("suggests a number in the current financial year", () => {
    expect(invoiceDefaults(new Date(2026, 8, 17)).invoiceNumber).toBe("INV-2627-001");
    expect(invoiceDefaults(new Date(2026, 1, 17)).invoiceNumber).toBe("INV-2526-001");
  });
});

describe("both tools through the doorway", () => {
  it("asks for invoice details before it can answer", async () => {
    const r = await callTool({ agent: "computation", tool: "generate_invoice", ctx: { profileId: "ROHAN-003" } });
    expect(r.needsInput).not.toBeNull();
    expect(r.needsInput!.resumeTool).toBe("generate_invoice");
  });

  it("declines an invoice for a salaried user", async () => {
    const r = await callTool({ agent: "computation", tool: "generate_invoice", ctx: { profileId: "PRIYA-001" } });
    expect(r.facts.applicable).toBe("no");
  });

  it("answers once the details are given", async () => {
    const r = await callTool({
      agent: "computation", tool: "generate_invoice",
      args: { invoice: { clientName: "Northwind", amount: "1,00,000", chargeGST: "yes", description: "Design" } },
      ctx: { profileId: "ROHAN-003" },
    });
    expect(r.facts.fee).toBe(100000);
    expect(r.facts.client).toBe("Northwind");
  });

  it("compares investments for anyone", async () => {
    const r = await callTool({ agent: "computation", tool: "compare_investments", ctx: { profileId: "PRIYA-001" } });
    expect(Number(r.facts.optionCount)).toBe(OPTIONS.length);
    expect(r.facts.largestSavingOption).toBeTruthy();
  });

  it("is still refused to the Tutor", async () => {
    await expect(callTool({ agent: "tutor", tool: "compare_investments", ctx: { profileId: "PRIYA-001" } })).rejects.toThrow();
  });
});

describe("how long ago something happened", () => {
  const now = new Date(2026, 8, 17);
  it("says today and yesterday rather than a day count", () => {
    expect(ago(new Date(2026, 8, 17), now)).toBe("today");
    expect(ago(new Date(2026, 8, 16), now)).toBe("yesterday");
    expect(ago(new Date(2026, 8, 9), now)).toBe("8 days ago");
  });
});

describe("failures observed in live runs", () => {
  it("routes invoicing and investing to Computation, though neither says tax", async () => {
    const { keywordVerdict } = await import("@/lib/orchestrator/route");
    // Measured: both went to the Tutor, which has no tool for either.
    for (const q of [
      "help me raise an invoice",
      "compare ELSS and PPF",
      "bill my client for 200000",
      "where should I invest to save tax?",
    ]) {
      expect({ q, ...keywordVerdict(q) }).toMatchObject({ agent: "computation", confident: true });
    }
  });

  it("still sends a definitional question about the same words to the Tutor", async () => {
    const { keywordVerdict } = await import("@/lib/orchestrator/route");
    for (const q of ["what is ELSS?", "what is an invoice?"]) {
      expect({ q, ...keywordVerdict(q) }).toMatchObject({ agent: "tutor" });
    }
  });

  it("expects no TDS on an invoice to a client outside India", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    // Section 194J obliges an Indian payer. Measured: an export invoice was
    // showing a deduction that would never happen.
    const base = {
      invoiceNumber: "R-1", clientName: "C", description: "Work",
      amount: 200000, chargeGST: "yes",
    };
    const home = await callTool({ agent: "computation", tool: "generate_invoice",
      args: { invoice: { ...base, isExport: "no" } }, ctx: { profileId: "ROHAN-003" } });
    const away = await callTool({ agent: "computation", tool: "generate_invoice",
      args: { invoice: { ...base, isExport: "yes" } }, ctx: { profileId: "ROHAN-003" } });

    expect(home.facts.tdsExpected).toBe(20000);
    expect(away.facts.tdsExpected).toBe(0);
    // Zero-rated, so nothing is added and nothing is deducted.
    expect(away.facts.gst).toBe(0);
    expect(away.facts.amountYouShouldReceive).toBe(200000);
  });

  it("charges GST on the fee and TDS on the fee, never on each other", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    const r = await callTool({ agent: "computation", tool: "generate_invoice",
      args: { invoice: { invoiceNumber: "R-2", clientName: "C", description: "W",
                         amount: 200000, isExport: "no", chargeGST: "yes" } },
      ctx: { profileId: "ROHAN-003" } });
    // 18% of the fee, not of the total; 10% of the fee, not of fee plus GST.
    expect(r.facts.gst).toBe(36000);
    expect(r.facts.tdsExpected).toBe(20000);
    expect(r.facts.invoiceTotal).toBe(236000);
    expect(r.facts.amountYouShouldReceive).toBe(216000);
  });
});

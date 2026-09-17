import { describe, it, expect } from "vitest";
import { prepareITR, prefillFrom, blankForm16 } from "@/lib/kernel/itr";
import { getProfile } from "@/lib/kernel/profiles";
import { callTool } from "@/lib/kernel/tools/execute";
import { RULES } from "@/lib/kernel/rules";

const priya = getProfile("PRIYA-001")!;
const arjun = getProfile("ARJUN-002")!;

function form16(over: Partial<ReturnType<typeof blankForm16>> = {}) {
  return { ...prefillFrom(priya), ...over };
}

describe("preparing a return", () => {
  it("runs eight steps, in order", () => {
    const r = prepareITR(form16(), priya);
    expect(r.steps).toHaveLength(8);
    expect(r.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("adds the three components of gross salary", () => {
    const r = prepareITR(form16({ salary17_1: 1000000, perquisites17_2: 50000, profitsInLieu17_3: 25000 }), priya);
    expect(r.grossSalary).toBe(1075000);
  });

  it("chooses whichever regime costs less", () => {
    const r = prepareITR(form16(), priya);
    const cheaper = r.taxPayable;
    expect(["new", "old"]).toContain(r.regimeChosen);
    expect(cheaper).toBeLessThanOrEqual(cheaper + r.savingVsOtherRegime);
  });

  it("reaches zero tax for Priya, as the engine does directly", () => {
    const r = prepareITR(form16(), priya);
    expect(r.regimeChosen).toBe("new");
    expect(r.taxPayable).toBe(0);
  });

  it("reports a refund when more was deducted than owed", () => {
    const r = prepareITR(form16({ tdsDeducted: 50000 }), priya);
    expect(r.refundDue).toBe(50000 - r.taxPayable);
    expect(r.steps[7].detail).toMatch(/due back to you/i);
  });

  it("reports a balance payable when too little was deducted", () => {
    const r = prepareITR(form16({ salary17_1: 2500000, tdsDeducted: 1000 }), priya);
    expect(r.refundDue).toBeLessThan(0);
    expect(r.steps[7].detail).toMatch(/still payable/i);
  });

  it("treats a house property loss as a section 24(b) deduction", () => {
    const withLoss = prepareITR(form16({ salary17_1: 2000000, housePropertyIncome: -200000 }), priya);
    const without = prepareITR(form16({ salary17_1: 2000000 }), priya);
    expect(withLoss.taxPayable).toBeLessThanOrEqual(without.taxPayable);
  });

  it("warns when a house property loss exceeds what can be set off", () => {
    const r = prepareITR(form16({ housePropertyIncome: -500000 }), priya);
    expect(r.warnings.join(" ")).toMatch(/cannot be set off/i);
  });

  it("warns that exempt allowances do nothing under the new regime", () => {
    const r = prepareITR(form16({ hraExempt10_13A: 240000 }), priya);
    if (r.regimeChosen === "new") expect(r.warnings.join(" ")).toMatch(/not available under the new regime/i);
  });

  it("validates its own arithmetic in step seven", () => {
    const r = prepareITR(form16(), priya);
    expect(r.steps[6].title).toMatch(/check the arithmetic/i);
    expect(r.steps[6].ok).toBe(true);
  });

  it("produces a document shaped like an ITR-1, submitted nowhere", () => {
    const r = prepareITR(form16({ tdsDeducted: 20000 }), priya);
    const itr = r.itr as Record<string, any>;
    expect(itr.assessmentYear).toBe(RULES._meta.assessmentYear);
    expect(itr.regimeOpted).toBeTruthy();
    expect(itr.taxComputation.totalTaxLiability).toBe(r.taxPayable);
    expect(itr.taxesPaid.tdsOnSalary).toBe(20000);
    expect(String(itr._note)).toMatch(/nothing has been submitted/i);
  });

  it("is deterministic", () => {
    const a = prepareITR(form16({ tdsDeducted: 12345 }), priya);
    const b = prepareITR(form16({ tdsDeducted: 12345 }), priya);
    expect(JSON.stringify(a.itr)).toBe(JSON.stringify(b.itr));
  });

  it("attaches a trace whose root equals the tax payable", () => {
    const r = prepareITR(form16(), priya);
    expect(r.trace.output).toBe(r.taxPayable);
  });
});

describe("a tool that asks before it answers", () => {
  const ctx = { profileId: "PRIYA-001" };

  it("requests the Form 16 figures when it has none", async () => {
    const r = await callTool({ agent: "computation", tool: "prepare_itr", ctx });
    expect(r.needsInput).not.toBeNull();
    expect(r.component).toBe("input_form");
    expect(r.needsInput!.resumeTool).toBe("prepare_itr");
    expect(r.needsInput!.fields.length).toBeGreaterThan(10);
  });

  it("names its fields after Form 16 Part B, so figures can be copied across", async () => {
    const r = await callTool({ agent: "computation", tool: "prepare_itr", ctx });
    const names = r.needsInput!.fields.map((f) => f.name);
    for (const expected of ["salary17_1", "perquisites17_2", "hraExempt10_13A", "professionalTax16_3", "tdsDeducted"]) {
      expect(names).toContain(expected);
    }
  });

  it("prefills from the profile so the user corrects rather than types from nothing", async () => {
    const r = await callTool({ agent: "computation", tool: "prepare_itr", ctx });
    const salary = r.needsInput!.fields.find((f) => f.name === "salary17_1");
    expect(salary!.defaultValue).toBe(priya.income.grossAnnual);
  });

  it("answers normally once the figures are supplied", async () => {
    const r = await callTool({
      agent: "computation", tool: "prepare_itr",
      args: { form16: { salary17_1: 1200000, tdsDeducted: 30000 } }, ctx,
    });
    expect(r.needsInput ?? null).toBeNull();
    expect(r.component).toBe("itr_summary");
    expect(r.facts.refundDue).toBe(30000);
  });

  it("accepts figures typed with commas and a rupee sign", async () => {
    const r = await callTool({
      agent: "computation", tool: "prepare_itr",
      args: { form16: { salary17_1: "\u20B912,00,000", tdsDeducted: "30,000" } }, ctx,
    });
    expect(r.facts.grossSalary).toBe(1200000);
    expect(r.facts.tdsDeducted).toBe(30000);
  });

  it("declines for a business owner, who has no Form 16", async () => {
    const r = await callTool({ agent: "computation", tool: "prepare_itr", ctx: { profileId: "ARJUN-002" } });
    expect(r.facts.applicable).toBe("no");
    expect(arjun.occupation).toBe("business");
  });

  it("is still refused to the Tutor, like every other tax function", async () => {
    await expect(callTool({ agent: "tutor", tool: "prepare_itr", ctx })).rejects.toThrow();
  });
});

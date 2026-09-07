import { describe, it, expect } from "vitest";
import { computeGST, presumptiveVsBooks, computeAdvanceTax, compute194J, getApplicableDeadlines } from "@/lib/kernel/business";
import { RULES } from "@/lib/kernel/rules";
import { getProfile } from "@/lib/kernel/profiles";

const arjun = getProfile("ARJUN-002")!;
const rohan = getProfile("ROHAN-003")!;

describe("GST", () => {
  it("charges nothing on exports", () => {
    const r = computeGST({ domesticTurnover: 0, exportTurnover: 1000000, gstPaidOnExpenses: 0 });
    expect(r.outputGST).toBe(0);
  });

  it("charges the standard rate on domestic turnover only", () => {
    const r = computeGST({ domesticTurnover: 800000, exportTurnover: 1000000, gstPaidOnExpenses: 0 });
    expect(r.outputGST).toBe(Math.round(800000 * RULES.gst.standardServiceRate));
  });

  it("subtracts input credit and never goes below zero", () => {
    const r = computeGST({ domesticTurnover: 100000, exportTurnover: 0, gstPaidOnExpenses: 900000 });
    expect(r.netGSTPayable).toBe(0);
  });

  it("flags registration once turnover crosses the threshold", () => {
    const under = computeGST({ domesticTurnover: 1500000, exportTurnover: 0, gstPaidOnExpenses: 0 });
    const over = computeGST({ domesticTurnover: 2500000, exportTurnover: 0, gstPaidOnExpenses: 0 });
    expect(under.registrationRequired).toBe(false);
    expect(over.registrationRequired).toBe(true);
  });
});

describe("presumptive taxation", () => {
  it("deems half of gross receipts for a professional under 44ADA", () => {
    const r = presumptiveVsBooks({ occupation: "profession", turnover: 1800000, actualExpenses: 400000, digitalReceiptShare: 1 });
    expect(r.options[0].scheme).toBe("44ADA");
    expect(r.options[0].declaredProfit).toBe(900000);
  });

  it("uses the lower rate for a business with almost entirely digital receipts", () => {
    const digital = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0.99 });
    const cash = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0.4 });
    expect(digital.options[0].declaredProfit).toBeLessThan(cash.options[0].declaredProfit);
  });

  it("marks the scheme unavailable above the ceiling", () => {
    const r = presumptiveVsBooks({ occupation: "profession", turnover: 90000000, actualExpenses: 100000, digitalReceiptShare: 1 });
    expect(r.options[0].eligible).toBe(false);
    expect(r.recommended).toBe("books");
  });

  it("recommends books when actual profit is lower than the deemed profit", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2000000, actualExpenses: 1980000, digitalReceiptShare: 1 });
    expect(r.recommended).toBe("books");
  });

  it("warns that expenses cannot also be claimed when it recommends presumptive", () => {
    const r = presumptiveVsBooks({ occupation: "profession", turnover: 1800000, actualExpenses: 400000, digitalReceiptShare: 1 });
    expect(r.recommended).toBe("presumptive");
    expect(r.caveats.length).toBeGreaterThan(0);
  });
});

describe("advance tax", () => {
  it("is not required below the minimum liability", () => {
    expect(computeAdvanceTax({ totalLiability: 5000, underPresumptiveScheme: false }).required).toBe(false);
  });

  it("splits into four instalments for a regular taxpayer", () => {
    const r = computeAdvanceTax({ totalLiability: 200000, underPresumptiveScheme: false });
    expect(r.instalments).toHaveLength(4);
    expect(r.instalments[3].cumulativeAmount).toBe(200000);
  });

  it("is a single March instalment under a presumptive scheme", () => {
    const r = computeAdvanceTax({ totalLiability: 200000, underPresumptiveScheme: true });
    expect(r.instalments).toHaveLength(1);
    expect(r.instalments[0].dueDate).toBe("15 Mar");
  });

  it("instalments always sum to the total liability", () => {
    const r = computeAdvanceTax({ totalLiability: 137777, underPresumptiveScheme: false });
    expect(r.instalments.reduce((s, i) => s + i.instalmentAmount, 0)).toBe(137777);
  });
});

describe("194J", () => {
  it("computes the expected deduction at the statutory rate", () => {
    const r = compute194J(1800000);
    expect(r.expectedTDS).toBe(Math.round(1800000 * RULES.tds["194J"].rate));
  });
});

describe("compliance calendar", () => {
  it("gives a salaried person the Form 16 date but no advance tax", () => {
    const d = getApplicableDeadlines({ occupation: "salaried", gstRegistered: false });
    expect(d.some((e) => e.id === "form16")).toBe(true);
    expect(d.some((e) => e.id === "adv_q1")).toBe(false);
  });

  it("gives a business advance tax dates", () => {
    const d = getApplicableDeadlines({ occupation: "business", gstRegistered: false });
    expect(d.filter((e) => e.id.startsWith("adv_")).length).toBe(4);
  });

  it("adds GST returns only when registered", () => {
    const off = getApplicableDeadlines({ occupation: "business", gstRegistered: false });
    const on = getApplicableDeadlines({ occupation: "business", gstRegistered: true });
    expect(off.some((e) => e.id === "gstr3b")).toBe(false);
    expect(on.some((e) => e.id === "gstr3b")).toBe(true);
  });

  it("everyone gets the filing deadline", () => {
    for (const occ of ["salaried", "business", "profession"] as const) {
      expect(getApplicableDeadlines({ occupation: occ, gstRegistered: false }).some((e) => e.id === "itr_due")).toBe(true);
    }
  });
});

describe("profiles are wired correctly", () => {
  it("Arjun is a business and Rohan is a profession", () => {
    expect(arjun.occupation).toBe("business");
    expect(rohan.occupation).toBe("profession");
  });

  it("Rohan's receipts split into export and domestic", () => {
    expect((rohan.income.exportReceipts ?? 0) + (rohan.income.domesticReceipts ?? 0))
      .toBe(rohan.income.grossReceiptsAnnual);
  });
});

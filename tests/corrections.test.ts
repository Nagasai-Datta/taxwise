import { describe, it, expect } from "vitest";
import { presumptiveVsBooks } from "@/lib/kernel/business";
import { callTool } from "@/lib/kernel/tools/execute";

/**
 * Two corrections found while preparing independent expected answers for the
 * evaluation. Both were rule-application errors: the rates were right, but
 * applied to the wrong amounts.
 */
describe("44AD deems each part of turnover at its own rate", () => {
  it("gives Arjun 6% of his digital receipts plus 8% of the rest", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0.95 });
    expect(r.options[0].declaredProfit).toBe(136800 + 9600);
  });

  it("uses 6% on everything when every receipt is digital", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 1 });
    expect(r.options[0].declaredProfit).toBe(144000);
  });

  it("uses 8% on everything when no receipt is digital", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0 });
    expect(r.options[0].declaredProfit).toBe(192000);
  });
});

describe("194J applies only to fees from clients in India", () => {
  it("expects Rohan's Indian clients to deduct 10% of his domestic receipts, with no shortfall", async () => {
    const r = await callTool({ agent: "computation", tool: "compute_194j_tds", ctx: { profileId: "ROHAN-003" } });
    expect(r.facts.domesticReceipts).toBe(800000);
    expect(r.facts.expectedTDS).toBe(80000);
    expect(r.facts.shortfall).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { checkReply, extractNumbers } from "@/lib/kernel/guard";

const facts = [{ totalTax: 87880, taxableIncome: 860000, cess: 3380 }];

describe("the invented-number guard", () => {
  it("accepts a reply that only uses figures the kernel produced", () => {
    const r = checkReply("Your tax comes to \u20B987,880 on a taxable income of \u20B98,60,000.", facts);
    expect(r.ok).toBe(true);
  });

  it("catches a figure the model made up", () => {
    const r = checkReply("Your tax comes to \u20B987,880, and you could save \u20B945,000 more.", facts);
    expect(r.ok).toBe(false);
    expect(r.offending.join()).toContain("45,000");
  });

  it("catches arithmetic the model did on its own", () => {
    // 87880 + 3380 is not a fact it was given, even though both parts were.
    const r = checkReply("That works out to \u20B991,260 in total.", facts);
    expect(r.ok).toBe(false);
  });

  it("ignores small numbers that appear in ordinary prose", () => {
    const r = checkReply("The exemption is the least of three amounts, and cess is 4 percent.", facts);
    expect(r.ok).toBe(true);
  });

  it("ignores section numbers", () => {
    const r = checkReply("You have not fully used section 80C or section 24.", facts);
    expect(r.ok).toBe(true);
  });

  it("reads Indian digit grouping", () => {
    expect(extractNumbers("\u20B912,00,000 and \u20B975,000")).toEqual([1200000, 75000]);
  });
});

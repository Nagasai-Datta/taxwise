import { describe, it, expect } from "vitest";
import { normaliseNumbers, inrGroup, checkReply } from "@/lib/kernel/guard";

const facts = [{ turnover: 2400000, presumptiveProfit: 144000, profitFromBooks: 1500000, exemption: 240000 }];

describe("Indian digit grouping", () => {
  it("groups the last three digits then pairs", () => {
    expect(inrGroup(240000)).toBe("2,40,000");
    expect(inrGroup(2400000)).toBe("24,00,000");
    expect(inrGroup(1200000)).toBe("12,00,000");
    expect(inrGroup(87880)).toBe("87,880");
    expect(inrGroup(0)).toBe("0");
    expect(inrGroup(999)).toBe("999");
  });
});

describe("rewriting what the model wrote", () => {
  it("corrects the exact mistake observed in a live run", () => {
    // gpt-oss-20b wrote: "a turnover of ₹2,400,000"
    const out = normaliseNumbers("Your business has a turnover of \u20B92,400,000.", facts);
    expect(out).toContain("\u20B924,00,000");
    expect(out).not.toContain("2,400,000");
  });

  it("corrects an unformatted number", () => {
    expect(normaliseNumbers("You would declare \u20B9144000 as profit.", facts)).toContain("1,44,000");
  });

  it("leaves an already correct figure alone", () => {
    const text = "Your exemption is \u20B92,40,000 for the year.";
    expect(normaliseNumbers(text, facts)).toBe(text);
  });

  it("replaces the longest match first so a figure inside another is not broken", () => {
    const out = normaliseNumbers("Books give \u20B91,500,000 and the scheme gives \u20B9144,000.", facts);
    expect(out).toContain("15,00,000");
    expect(out).toContain("1,44,000");
  });

  it("never touches a number that did not come from a tool", () => {
    const out = normaliseNumbers("Section 80C and section 24 apply, over 8 years.", facts);
    expect(out).toContain("section 24");
    expect(out).toContain("8 years");
  });

  it("leaves small numbers alone entirely", () => {
    expect(normaliseNumbers("Cess is 4 percent and there are 3 candidates.", facts))
      .toBe("Cess is 4 percent and there are 3 candidates.");
  });

  it("still passes the guard after rewriting", () => {
    const rewritten = normaliseNumbers("Turnover is \u20B92,400,000.", facts);
    expect(checkReply(rewritten, facts).ok).toBe(true);
  });
});

describe("scaled units, the failure seen on Arjun", () => {
  // Live run: guard rejected "2.4, 144, 1.5". The model had not invented
  // anything, it had written the figures in millions.
  it("resolves Western scale words to the exact figure", () => {
    const out = normaliseNumbers(
      "Turnover is \u20B92.4 million and books give \u20B91.5 million.", facts);
    expect(out).toContain("24,00,000");
    expect(out).toContain("15,00,000");
    expect(checkReply(out, facts).ok).toBe(true);
  });

  it("resolves Indian scale words too", () => {
    const out = normaliseNumbers("Turnover of \u20B924 lakh and profit of \u20B91.44 lakh.", facts);
    expect(out).toContain("24,00,000");
    expect(out).toContain("1,44,000");
    expect(checkReply(out, facts).ok).toBe(true);
  });

  it("handles thousand and k", () => {
    expect(normaliseNumbers("about \u20B9144 thousand", facts)).toContain("1,44,000");
    expect(normaliseNumbers("about \u20B9144k", facts)).toContain("1,44,000");
  });

  it("leaves a scaled figure alone when no tool produced that value", () => {
    // 9 million matches nothing, so it must survive and be rejected.
    const out = normaliseNumbers("Your turnover is \u20B99 million.", facts);
    expect(out).toContain("9 million");
    expect(checkReply(out, facts).ok).toBe(false);
  });

  it("still rejects a plainly invented figure after normalising", () => {
    const out = normaliseNumbers("You could save \u20B945,000 more.", facts);
    expect(checkReply(out, facts).ok).toBe(false);
  });

  it("does not mangle a section number that looks like a scale", () => {
    const out = normaliseNumbers("Section 80C and section 24 apply.", facts);
    expect(out).toContain("Section 80C");
    expect(out).toContain("section 24");
  });
});

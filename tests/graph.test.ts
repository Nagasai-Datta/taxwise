import { describe, it, expect } from "vitest";
import { propagateGraph, invertGraph, NODES, LEVERS, NODE_BY_ID } from "@/lib/kernel/graph";
import { computeTax } from "@/lib/kernel/tax";
import { getProfile } from "@/lib/kernel/profiles";

const priya = getProfile("PRIYA-001")!;
const base = {
  grossSalary: priya.income.grossAnnual,
  basicSalary: priya.income.basicAnnual ?? 0,
  hraReceived: priya.income.hraReceivedAnnual ?? 0,
  rentAnnual: priya.rentMonthly * 12,
  d80C: priya.deductions["80C"] ?? 0,
  d80D: 0, d80CCD1B: 0, d24b: 0,
  annualSpending: 600000,
  isMetro: 0,
};

describe("the graph itself", () => {
  it("gives every node a label, a kind and an explanation", () => {
    for (const n of NODES) {
      expect(n.label.length).toBeGreaterThan(2);
      expect(["input", "derived"]).toContain(n.kind);
      expect(n.explain.length).toBeGreaterThan(20);
    }
  });

  it("names only nodes that exist in every dependency list", () => {
    for (const n of NODES) for (const f of n.from) expect(NODE_BY_ID[f]).toBeDefined();
  });

  it("gives every input a range, and no derived node one", () => {
    for (const n of NODES) {
      if (n.kind === "input") expect(typeof n.max).toBe("number");
      else expect(n.from.length).toBeGreaterThan(0);
    }
  });

  it("offers only inputs as levers", () => {
    for (const l of LEVERS) expect(NODE_BY_ID[l].kind).toBe("input");
  });
});

describe("forward propagation agrees with the tax engine", () => {
  it("produces the same total tax as calling computeTax directly", () => {
    const g = propagateGraph(base, "old");
    const direct = computeTax({
      regime: "old", grossIncome: base.grossSalary, isSalaried: true,
      deductions: { "80C": base.d80C, "80D": 0, "80CCD1B": 0, "24b": 0 },
      hra: { basicAnnual: base.basicSalary, hraReceivedAnnual: base.hraReceived,
             rentAnnual: base.rentAnnual, isMetro: false },
    });
    expect(g.values.totalTax).toBe(direct.totalTax);
    expect(g.values.taxableIncome).toBe(direct.taxableIncome);
    expect(g.values.hraExemption).toBe(direct.hraExemption);
  });

  it("reaches Priya's zero under the new regime", () => {
    expect(propagateGraph(base, "new").values.totalTax).toBe(0);
  });

  it("ignores deductions and HRA under the new regime", () => {
    const withD = propagateGraph({ ...base, d80C: 150000 }, "new").values.totalTax;
    const without = propagateGraph({ ...base, d80C: 0 }, "new").values.totalTax;
    expect(withD).toBe(without);
  });

  it("never lets more deduction raise tax", () => {
    let last = Infinity;
    for (let c = 0; c <= 150000; c += 25000) {
      const t = propagateGraph({ ...base, d80C: c }, "old").values.totalTax;
      expect(t).toBeLessThanOrEqual(last);
      last = t;
    }
  });

  it("derives saving and the rate from what is left", () => {
    const g = propagateGraph(base, "old").values;
    expect(g.annualSaving).toBe(g.netIncome - g.annualSpending);
    expect(g.savingsRate).toBeCloseTo((g.annualSaving / g.netIncome) * 100, 1);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(propagateGraph(base, "old").values))
      .toBe(JSON.stringify(propagateGraph(base, "old").values));
  });
});

describe("solving backwards", () => {
  it("finds the spending that produces a wanted saving", () => {
    const r = invertGraph({ inputs: base, lever: "annualSpending", target: "annualSaving", targetValue: 400000, regime: "old" });
    expect(r.achievable).toBe(true);
    expect(Math.abs(r.achievedValue - 400000)).toBeLessThan(2);
  });

  it("lands on a lever value that actually produces the answer it claims", () => {
    const r = invertGraph({ inputs: base, lever: "annualSpending", target: "annualSaving", targetValue: 300000, regime: "old" });
    const check = propagateGraph({ ...base, annualSpending: r.requiredLever }, "old").values.annualSaving;
    expect(Math.abs(check - r.achievedValue)).toBeLessThan(2);
  });

  it("says plainly when a target cannot be reached by that lever", () => {
    // Filling 80C to its ceiling cannot bring Priya's old-regime tax to zero.
    const r = invertGraph({ inputs: base, lever: "d80C", target: "totalTax", targetValue: 0, regime: "old" });
    expect(r.achievable).toBe(false);
    expect(r.explanation).toMatch(/cannot reach/i);
  });

  it("does not present a nearest value as though it were the answer", () => {
    const r = invertGraph({ inputs: base, lever: "d80C", target: "totalTax", targetValue: 0, regime: "old" });
    expect(r.explanation).not.toMatch(/would need to be/i);
  });

  it("reports when the answer sits at a statutory ceiling", () => {
    const r = invertGraph({ inputs: base, lever: "d80C", target: "totalTax", targetValue: 67080, regime: "old" });
    if (r.achievable) expect(r.requiredLever).toBeLessThanOrEqual(150000);
  });

  it("converges in well under its iteration budget", () => {
    const r = invertGraph({ inputs: base, lever: "annualSpending", target: "savingsRate", targetValue: 50, regime: "old" });
    expect(r.iterations).toBeLessThanOrEqual(40);
    expect(r.achievable).toBe(true);
  });

  it("handles a target already met, without moving the lever far", () => {
    const now = propagateGraph(base, "old").values.totalTax;
    const r = invertGraph({ inputs: base, lever: "d80C", target: "totalTax", targetValue: now, regime: "old" });
    expect(Math.abs(r.requiredLever - base.d80C)).toBeLessThan(6000);
  });

  it("works on the rebate cliff, where algebra would step over it", () => {
    // Just above the 87A threshold, a small deduction removes the tax entirely.
    const near = { ...base, grossSalary: 1275000, d80C: 0 };
    const r = invertGraph({ inputs: near, lever: "d80C", target: "totalTax", targetValue: 0, regime: "old" });
    const at = propagateGraph({ ...near, d80C: r.requiredLever }, "old").values.totalTax;
    expect(at).toBe(r.achievedValue);
  });
});

describe("failures observed in live runs", () => {
  it("routes a backwards question to Computation, whatever it targets", async () => {
    const { keywordVerdict } = await import("@/lib/orchestrator/route");
    // Measured: "what spending would give me a 50 percent savings rate" went to
    // Management, which cannot solve backwards and said it lacked the figure.
    const backwards = [
      "how much do I need to invest for my tax to be 40000?",
      "what spending would give me a 50 percent savings rate?",
      "how much should I invest so that my tax is 20000?",
      "what do I need to do to bring my tax down to 50000?",
    ];
    for (const q of backwards) {
      expect({ q, ...keywordVerdict(q) }).toMatchObject({ agent: "computation", confident: true });
    }
  });

  it("still routes an ordinary spending question to Management", async () => {
    const { keywordVerdict } = await import("@/lib/orchestrator/route");
    for (const q of ["how much did I spend?", "what is my savings rate?", "show my recent transactions"]) {
      expect({ q, ...keywordVerdict(q) }).toMatchObject({ agent: "management" });
    }
  });

  it("chooses a lever when the user names only a target", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    // Measured: the model asked which deduction to adjust instead of answering.
    const tax = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "totalTax", targetValue: 40000 }, ctx: { profileId: "PRIYA-001" } });
    expect(tax.facts.leverChosenAutomatically).toBe("yes");
    expect(tax.facts.lever).toMatch(/80C/i);

    const rate = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "savingsRate", targetValue: 50 }, ctx: { profileId: "PRIYA-001" } });
    expect(rate.facts.lever).toMatch(/spending/i);
  });

  it("phrases a percentage target as a percentage, not as rupees", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    const { describeResult } = await import("@/lib/agents/describe");
    const r = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "savingsRate", targetValue: 50 }, ctx: { profileId: "PRIYA-001" } });
    const text = describeResult([r]);
    expect(text).toMatch(/%/);
    expect(text).not.toMatch(/Savings rate to \u20B9/);
  });
});

describe("a true set of numbers can still make a false claim", () => {
  it("withholds the required value when the target is unreachable", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    // Observed: the model wrote "you'd need to invest 1,50,000 to bring your
    // tax down to 40,000". Every figure was real. The claim was false.
    const r = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "totalTax", targetValue: 40000 }, ctx: { profileId: "PRIYA-001" } });
    expect(r.facts.achievable).toBe("no");
    expect(r.facts.requiredLever).toBeUndefined();
    expect(r.facts.bestAchievable).toBe(67080);
  });

  it("marks an unreachable verdict as one the model must not paraphrase", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    const no = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "totalTax", targetValue: 40000 }, ctx: { profileId: "PRIYA-001" } });
    const yes = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "savingsRate", targetValue: 50 }, ctx: { profileId: "PRIYA-001" } });
    expect(no.authoritative).toBe(true);
    // A reachable answer leaves the model free to word it.
    expect(yes.authoritative).toBe(false);
  });

  it("would now reject that exact false sentence", async () => {
    const { callTool } = await import("@/lib/kernel/tools/execute");
    const { checkReply } = await import("@/lib/kernel/guard");
    const r = await callTool({ agent: "computation", tool: "solve_backwards",
      args: { target: "totalTax", targetValue: 40000 }, ctx: { profileId: "PRIYA-001" } });
    const bad = "You would need to invest \u20B91,50,000 in Section 80C to bring your tax down to \u20B940,000.";
    expect(checkReply(bad, [r.facts]).ok).toBe(false);
  });
});

describe("figures written as words", () => {
  it("catches the sentence a model actually produced", async () => {
    const { checkReply } = await import("@/lib/kernel/guard");
    const observed = "You would need to spend about five hundred fifty thousand seven hundred eighty one rupees annually.";
    const g = checkReply(observed, [{ requiredLever: 550781 }]);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/written in words/i);
  });

  it("catches a spelled-out percentage", async () => {
    const { checkReply } = await import("@/lib/kernel/guard");
    expect(checkReply("roughly fifty point four seven percent", [{ v: 50.47 }]).ok).toBe(false);
  });

  it("leaves ordinary prose alone", async () => {
    const { checkReply } = await import("@/lib/kernel/guard");
    for (const t of [
      "The exemption is the least of three amounts.",
      "You may choose one of two regimes.",
      "Cess is 4 percent of the tax after rebate.",
      "There are four instalments across the year.",
    ]) {
      expect({ t, ok: checkReply(t, [{ v: 1 }]).ok }).toMatchObject({ ok: true });
    }
  });

  it("accepts the same figure written properly", async () => {
    const { checkReply } = await import("@/lib/kernel/guard");
    expect(checkReply("You would need to spend \u20B95,50,781 annually.", [{ requiredLever: 550781 }]).ok).toBe(true);
  });
});

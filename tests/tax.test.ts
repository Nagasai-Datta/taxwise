import { describe, it, expect } from "vitest";
import { computeTax } from "@/lib/kernel/tax";
import { compareRegimes } from "@/lib/kernel/regimes";
import { optimizeDeductions } from "@/lib/kernel/optimize";
import { computeHRAExemption } from "@/lib/kernel/hra";
import { applyDeductionCaps } from "@/lib/kernel/deductions";
import { allProfiles, getProfile, toTaxInput } from "@/lib/kernel/profiles";
import { RULES } from "@/lib/kernel/rules";

const priya = getProfile("PRIYA-001")!;

describe("slab engine", () => {
  it("charges nothing below the first threshold", () => {
    expect(computeTax({ regime: "new", grossIncome: 300000, isSalaried: true }).totalTax).toBe(0);
  });

  it("sums the per-band tax to the pre-rebate total", () => {
    const r = computeTax({ regime: "new", grossIncome: 3000000, isSalaried: true });
    expect(r.bands.reduce((s, b) => s + b.taxInBand, 0)).toBe(r.taxBeforeRebate);
  });

  it("never produces a negative taxable income", () => {
    expect(computeTax({ regime: "old", grossIncome: 30000, isSalaried: true }).taxableIncome).toBe(0);
  });

  it("taxes each band only on the income that falls inside it", () => {
    const r = computeTax({ regime: "new", grossIncome: 875000, isSalaried: true });
    expect(r.taxableIncome).toBe(800000);
    const band = r.bands.find((b) => b.from === 400000)!;
    expect(band.amountInBand).toBe(400000);
    expect(band.taxInBand).toBe(20000);
  });
});

describe("section 87A rebate", () => {
  it("wipes out Priya's liability under the new regime", () => {
    const r = computeTax({ ...toTaxInput(priya), regime: "new" });
    expect(r.taxableIncome).toBe(1125000);
    expect(r.totalTax).toBe(0);
  });

  it("does not apply above the threshold", () => {
    expect(computeTax({ regime: "new", grossIncome: 2000000, isSalaried: true }).rebate87A).toBe(0);
  });

  it("is capped at the maximum rebate", () => {
    const r = computeTax({ regime: "new", grossIncome: 1275000, isSalaried: true });
    expect(r.rebate87A).toBeLessThanOrEqual(RULES.regimes.new.rebate87A.maxRebate);
  });
});

describe("cess", () => {
  it("is four percent of the tax after rebate, and total is the sum", () => {
    const r = computeTax({ regime: "old", grossIncome: 1500000, isSalaried: true });
    expect(r.cess).toBe(Math.round(r.taxAfterRebate * 0.04));
    expect(r.totalTax).toBe(r.taxAfterRebate + r.cess);
  });

  it("is zero when the rebate wipes out the tax", () => {
    expect(computeTax({ ...toTaxInput(priya), regime: "new" }).cess).toBe(0);
  });
});

describe("HRA least of three", () => {
  it("picks the smallest of the three candidates", () => {
    const h = computeHRAExemption({ basicAnnual: 900000, hraReceivedAnnual: 450000, rentAnnual: 480000, isMetro: true });
    expect(h.exemption).toBe(Math.min(...h.candidates.map((c) => c.value)));
    expect(h.candidates).toHaveLength(3);
  });

  it("uses 40 percent of basic for a non-metro city", () => {
    const h = computeHRAExemption({ basicAnnual: 600000, hraReceivedAnnual: 300000, rentAnnual: 300000, isMetro: false });
    expect(h.candidates[1].value).toBe(240000);
  });

  it("uses 50 percent of basic for a metro city", () => {
    const h = computeHRAExemption({ basicAnnual: 600000, hraReceivedAnnual: 400000, rentAnnual: 400000, isMetro: true });
    expect(h.candidates[1].value).toBe(300000);
  });

  it("never returns a negative exemption when rent is tiny", () => {
    const h = computeHRAExemption({ basicAnnual: 900000, hraReceivedAnnual: 400000, rentAnnual: 12000, isMetro: false });
    expect(h.exemption).toBe(0);
  });
});

describe("deduction caps", () => {
  it("trims a claim to the statutory ceiling", () => {
    const over = applyDeductionCaps("old", { "80C": 900000 });
    expect(over.total).toBe(RULES.deductions["80C"].cap);
  });

  it("ignores Chapter VI-A entirely under the new regime", () => {
    const withD = computeTax({ regime: "new", grossIncome: 1500000, isSalaried: true, deductions: { "80C": 150000 } });
    const without = computeTax({ regime: "new", grossIncome: 1500000, isSalaried: true });
    expect(withD.totalTax).toBe(without.totalTax);
  });

  it("records that a cap was applied so the trace can explain it", () => {
    const r = applyDeductionCaps("old", { "80C": 250000 });
    expect(r.applied[0].claimed).toBe(250000);
    expect(r.applied[0].allowed).toBe(150000);
  });
});

describe("regime comparison", () => {
  it("recommends whichever regime costs less, for every profile", () => {
    for (const p of allProfiles()) {
      const c = compareRegimes(toTaxInput(p));
      const cheaper = c.newRegime.totalTax <= c.oldRegime.totalTax ? "new" : "old";
      expect(c.recommended).toBe(cheaper);
      expect(c.saving).toBe(Math.abs(c.newRegime.totalTax - c.oldRegime.totalTax));
    }
  });
});

describe("deduction optimiser", () => {
  it("never reports a negative saving", () => {
    for (const p of allProfiles()) {
      for (const o of optimizeDeductions(toTaxInput(p)).opportunities) {
        expect(o.taxSavedIfFilled).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ranks opportunities by rupee saving", () => {
    const o = optimizeDeductions(toTaxInput(priya)).opportunities;
    for (let i = 1; i < o.length; i++) {
      expect(o[i - 1].taxSavedIfFilled).toBeGreaterThanOrEqual(o[i].taxSavedIfFilled);
    }
  });

  it("measures saving by re-running the engine, so it respects the 87A cliff", () => {
    const input = { grossIncome: 1300000, isSalaried: true, deductions: { "80C": 0 } };
    const o = optimizeDeductions(input);
    const c80 = o.opportunities.find((x) => x.section === "80C")!;
    expect(c80.taxSavedIfFilled).toBeGreaterThanOrEqual(0);
    expect(o.bestPossibleTax).toBeLessThanOrEqual(o.baselineTax);
  });
});

describe("determinism", () => {
  it("returns an identical result on repeated calls", () => {
    const a = computeTax({ ...toTaxInput(priya), regime: "old" });
    const b = computeTax({ ...toTaxInput(priya), regime: "old" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("trace", () => {
  it("attaches a trace whose root output equals the total tax", () => {
    const r = computeTax({ ...toTaxInput(priya), regime: "old" });
    expect(r.trace.output).toBe(r.totalTax);
    expect(r.trace.children!.length).toBeGreaterThan(0);
  });

  it("gives every node a rule id", () => {
    const walk = (n: { ruleId: string; children?: unknown[] }): void => {
      expect(n.ruleId).toBeTruthy();
      (n.children as { ruleId: string; children?: unknown[] }[] | undefined)?.forEach(walk);
    };
    walk(computeTax({ ...toTaxInput(priya), regime: "old" }).trace);
  });
});

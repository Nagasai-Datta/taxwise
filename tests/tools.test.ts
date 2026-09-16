import { describe, it, expect } from "vitest";
import { callTool } from "@/lib/kernel/tools/execute";
import { TOOLS } from "@/lib/kernel/tools/registry";
import { computeTax } from "@/lib/kernel/tax";
import { toTaxInput, getProfile } from "@/lib/kernel/profiles";

const priya = { profileId: "PRIYA-001" };
const arjun = { profileId: "ARJUN-002" };
const rohan = { profileId: "ROHAN-003" };

describe("tools return what the kernel computed, unchanged", () => {
  it("compute_tax matches a direct kernel call", async () => {
    const viaTool = await callTool({ agent: "computation", tool: "compute_tax", args: { regime: "new" }, ctx: priya });
    const direct = computeTax({ ...toTaxInput(getProfile("PRIYA-001")!), regime: "new" });
    expect(viaTool.facts.totalTax).toBe(direct.totalTax);
    expect(viaTool.facts.taxableIncome).toBe(direct.taxableIncome);
  });

  it("compare_regimes reports Priya owing nothing under the new regime", async () => {
    const r = await callTool({ agent: "computation", tool: "compare_regimes", ctx: priya });
    expect(r.facts.newRegimeTax).toBe(0);
    expect(r.facts.recommended).toBe("New Regime");
  });

  it("attaches a trace whose root equals the headline figure", async () => {
    const r = await callTool({ agent: "computation", tool: "compute_tax", args: { regime: "old" }, ctx: priya });
    expect(r.trace).not.toBeNull();
    expect(r.trace!.output).toBe(r.facts.totalTax);
  });

  it("names the component that should render the result", async () => {
    const r = await callTool({ agent: "computation", tool: "compare_regimes", ctx: priya });
    expect(r.component).toBe("regime_comparison");
  });
});

describe("tools decline gracefully when a rule does not apply", () => {
  it("says HRA does not arise for a business owner", async () => {
    const r = await callTool({ agent: "computation", tool: "compute_hra_exemption", ctx: arjun });
    expect(r.facts.applicable).toBe("no");
  });

  it("says presumptive taxation does not apply to a salaried user", async () => {
    const r = await callTool({ agent: "computation", tool: "presumptive_vs_books", ctx: priya });
    expect(r.facts.applicable).toBe("no");
  });

  it("says 194J does not apply to a business owner", async () => {
    const r = await callTool({ agent: "computation", tool: "compute_194j_tds", ctx: arjun });
    expect(r.facts.applicable).toBe("no");
  });
});

describe("the right scheme for the right occupation", () => {
  it("uses 44AD for a business", async () => {
    const r = await callTool({ agent: "computation", tool: "presumptive_vs_books", ctx: arjun });
    expect(r.facts.scheme).toBe("44AD");
  });

  it("uses 44ADA for a professional", async () => {
    const r = await callTool({ agent: "computation", tool: "presumptive_vs_books", ctx: rohan });
    expect(r.facts.scheme).toBe("44ADA");
  });
});

describe("every registry entry is well formed", () => {
  it("has a name matching its key, a description and a component", () => {
    for (const [key, spec] of Object.entries(TOOLS)) {
      expect(spec.name).toBe(key);
      expect(spec.description.length).toBeGreaterThan(30);
      expect(spec.component).toBeTruthy();
    }
  });

  it("declares only numbers and strings as facts", async () => {
    const r = await callTool({ agent: "computation", tool: "optimize_deductions", ctx: priya });
    for (const v of Object.values(r.facts)) expect(["number", "string"]).toContain(typeof v);
  });
});

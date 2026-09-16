import { describe, it, expect } from "vitest";
import { CAPABILITIES, capabilitiesFor, groupedFor, guidedStartFor } from "@/lib/kernel/capabilities";
import { TOOL_NAMES } from "@/lib/kernel/tools/registry";
import { seemsLost } from "@/lib/orchestrator/route";
import { describeApproach, explainQueryFor } from "@/lib/agents/approach";
import { resolveFollowUps, extractFollowUps } from "@/lib/agents/followups";

describe("the capability catalogue", () => {
  it("names only tools that exist, so it cannot promise what the system does not do", () => {
    for (const c of CAPABILITIES) expect(TOOL_NAMES).toContain(c.tool);
  });

  it("has a unique id and a readable blurb for every entry", () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) {
      expect(c.blurb.length).toBeGreaterThan(25);
      expect(c.ask.length).toBeGreaterThan(8);
    }
  });

  it("shows business capabilities only to business and professional users", () => {
    const salaried = capabilitiesFor("salaried").map((c) => c.id);
    expect(salaried).not.toContain("gst");
    expect(salaried).not.toContain("presumptive");
    expect(capabilitiesFor("business").map((c) => c.id)).toContain("gst");
    expect(capabilitiesFor("profession").map((c) => c.id)).toContain("presumptive");
  });

  it("shows HRA only to a salaried user and 194J only to a professional", () => {
    expect(capabilitiesFor("salaried").map((c) => c.id)).toContain("hra");
    expect(capabilitiesFor("business").map((c) => c.id)).not.toContain("hra");
    expect(capabilitiesFor("profession").map((c) => c.id)).toContain("tds-194j");
    expect(capabilitiesFor("business").map((c) => c.id)).not.toContain("tds-194j");
  });

  it("groups without producing an empty group", () => {
    for (const occ of ["salaried", "business", "profession"] as const) {
      for (const g of groupedFor(occ)) expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("offers four openers per occupation, all of them real capabilities", () => {
    for (const occ of ["salaried", "business", "profession"] as const) {
      const o = guidedStartFor(occ);
      expect(o).toHaveLength(4);
      for (const c of o) expect(capabilitiesFor(occ).map((x) => x.id)).toContain(c.id);
    }
  });
});

describe("recognising someone who does not know where to start", () => {
  const lost = ["help", "hi", "I don't know where to start", "what can I ask?",
                "i'm lost", "guide me", "what can this do", "where do I begin", ""];
  for (const m of lost) {
    it(`treats "${m}" as needing a starting point`, () => expect(seemsLost(m)).toBe(true));
  }

  const notLost = ["which regime is better for me?", "how much tax do I owe?",
                   "what is section 80C?", "how much did I spend?", "should I use presumptive taxation?"];
  for (const m of notLost) {
    it(`treats "${m}" as a real question`, () => expect(seemsLost(m)).toBe(false));
  }
});

describe("the reasoning strip", () => {
  const fake = (tool: string) => ({
    tool, agent: "computation" as const, component: "none" as const,
    data: null, facts: {}, trace: null, durationMs: 1,
  });

  it("says why it routed and what it then did", () => {
    const s = describeApproach(
      { agent: "computation", usedModel: false, reason: "x", ms: 1 },
      [fake("compare_regimes")]
    );
    expect(s).toMatch(/numerical answer/i);
    expect(s).toMatch(/both regimes/i);
  });

  it("notes when no model was needed", () => {
    const s = describeApproach({ agent: "computation", usedModel: false, reason: "x", ms: 1 }, [fake("compute_tax")]);
    expect(s).toMatch(/no language model/i);
  });

  it("does not claim a step that did not happen", () => {
    const s = describeApproach({ agent: "tutor", usedModel: false, reason: "x", ms: 1 }, []);
    expect(s).not.toMatch(/worked out|added up/i);
  });

  it("joins several tools in order", () => {
    const s = describeApproach(
      { agent: "computation", usedModel: true, reason: "x", ms: 1 },
      [fake("get_profile_summary"), fake("compare_regimes")]
    );
    expect(s).toContain("then");
  });
});

describe("explain this", () => {
  it("asks about the ideas behind whichever tool ran", () => {
    expect(explainQueryFor(["compare_regimes"])).toMatch(/two tax regimes/i);
    expect(explainQueryFor(["compute_gst"])).toMatch(/input tax credit/i);
    expect(explainQueryFor(["presumptive_vs_books"])).toMatch(/presumptive/i);
  });

  it("falls back rather than returning nothing for an unmapped tool", () => {
    expect(explainQueryFor(["something_unmapped"]).length).toBeGreaterThan(5);
  });
});

describe("categorised follow-ups", () => {
  it("labels the fixed set understand, next and learn", () => {
    const r = resolveFollowUps("plain answer", "computation",
      [{ tool: "compare_regimes", agent: "computation", component: "regime_comparison",
         data: null, facts: {}, trace: null, durationMs: 1 }] as never);
    expect(r.source).toBe("fixed");
    expect(r.suggestions.map((f) => f.kind)).toEqual(["understand", "next", "learn"]);
  });

  it("reads the model's own labels when it supplies them", () => {
    const { parsed } = extractFollowUps(
      "An answer.\nFOLLOWUPS: U: why is that the rule? | N: what if I invest more? | L: what is a slab?"
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0].kind).toBe("understand");
    expect(parsed[1].kind).toBe("next");
    expect(parsed[2].kind).toBe("learn");
    expect(parsed[0].text).toBe("why is that the rule?");
  });

  it("assigns kinds by position when the model omits labels", () => {
    const { parsed } = extractFollowUps("A.\nFOLLOWUPS: first question here | second question here | third question here");
    expect(parsed.map((f) => f.kind)).toEqual(["understand", "next", "learn"]);
  });
});

describe("the pane differs by user, and overlaps where the tax code overlaps", () => {
  it("gives a salaried user no business group at all", () => {
    expect(groupedFor("salaried").map((g) => g.group)).not.toContain("business");
  });

  it("gives both self-employed types a business group", () => {
    expect(groupedFor("business").map((g) => g.group)).toContain("business");
    expect(groupedFor("profession").map((g) => g.group)).toContain("business");
  });

  it("shares tax and money capabilities across all three, because everyone pays tax", () => {
    const ids = (o: "salaried" | "business" | "profession") => new Set(capabilitiesFor(o).map((c) => c.id));
    const shared = [...ids("salaried")].filter((i) => ids("business").has(i) && ids("profession").has(i));
    expect(shared).toContain("compare-regimes");
    expect(shared).toContain("spending");
    expect(shared.length).toBeGreaterThanOrEqual(11);
  });

  it("every card composes a question rather than computing anything itself", () => {
    for (const c of CAPABILITIES) {
      expect(c.ask.trim().length).toBeGreaterThan(8);
      expect(/[?]|^Show /.test(c.ask)).toBe(true);
    }
  });

  it("counts match what the pane will show", () => {
    expect(capabilitiesFor("salaried")).toHaveLength(13);
    expect(capabilitiesFor("business")).toHaveLength(15);
    expect(capabilitiesFor("profession")).toHaveLength(16);
  });
});

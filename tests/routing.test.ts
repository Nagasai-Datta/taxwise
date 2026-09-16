import { describe, it, expect } from "vitest";
import { routeByKeyword, keywordVerdict } from "@/lib/orchestrator/route";
import { pickToolsDeterministically } from "@/lib/agents/fallback";
import { describeResult } from "@/lib/agents/describe";
import { AGENT_REGISTRY, AGENT_IDS } from "@/lib/kernel/agents";
import type { ToolResult } from "@/lib/kernel/tools/types";

describe("keyword routing, the path that works with no model", () => {
  const cases: [string, string][] = [
    ["What is section 80C?", "tutor"],
    ["Why does the old regime exist?", "tutor"],
    ["Explain what TDS means", "tutor"],
    ["How much tax do I owe?", "computation"],
    ["Which regime is better for me?", "computation"],
    ["How much GST do I need to pay?", "computation"],
    ["Should I use presumptive taxation?", "computation"],
    ["What is my net worth?", "management"],
    ["How much did I spend on food?", "management"],
    ["Can I afford a holiday from my goals?", "management"],
    ["Show my recent transactions", "management"],
  ];
  for (const [q, expected] of cases) {
    it(`routes "${q}" to ${expected}`, () => {
      expect(routeByKeyword(q)).toBe(expected);
    });
  }
});

describe("deterministic tool selection never breaks the wall", () => {
  it("only ever picks tools the agent is permitted to call", () => {
    const probes = [
      "how much tax", "which regime", "what is 80C", "my net worth", "gst",
      "presumptive", "advance tax", "194j", "hra", "spending", "goals",
      "recent transactions", "deadlines", "save more tax", "",
    ];
    for (const id of AGENT_IDS) {
      const allowed = new Set(AGENT_REGISTRY[id].tools);
      for (const p of probes) {
        for (const t of pickToolsDeterministically(id, p)) {
          expect(allowed.has(t)).toBe(true);
        }
      }
    }
  });

  it("always returns at least one tool for the computation agent", () => {
    expect(pickToolsDeterministically("computation", "anything at all").length).toBeGreaterThan(0);
  });
});

describe("deterministic phrasing", () => {
  const fake = (tool: string, facts: Record<string, number | string>): ToolResult => ({
    tool, agent: "computation", component: "none", data: null, facts, trace: null, durationMs: 1,
  });

  it("states the figures it was given and nothing else", () => {
    const text = describeResult([fake("compare_regimes", {
      newRegimeTax: 0, oldRegimeTax: 87880, recommended: "New Regime", saving: 87880,
    })]);
    expect(text).toContain("87,880");
    expect(text).toContain("New Regime");
  });

  it("says something useful when no tool ran", () => {
    expect(describeResult([])).toMatch(/could not work out/i);
  });

  it("handles a tool that reported the rule does not apply", () => {
    const text = describeResult([fake("presumptive_vs_books", { applicable: "no" })]);
    expect(text).toMatch(/not to salary/i);
  });
});

describe("the model is only consulted when keywords are unsure", () => {
  it("is confident about the two questions a small model got wrong", () => {
    // Measured failure: gpt-oss-20b classified both of these as tutor.
    expect(keywordVerdict("which regime is better for me?")).toMatchObject({ agent: "computation", confident: true });
    expect(keywordVerdict("should I use presumptive taxation?")).toMatchObject({ agent: "computation", confident: true });
  });

  it("is confident about every domain question", () => {
    const confident: [string, string][] = [
      ["how much tax do I owe?", "computation"],
      ["what is my GST liability?", "computation"],
      ["am I close to the GST threshold?", "computation"],
      ["how much did I spend on food?", "management"],
      ["what is my net worth?", "management"],
      ["show my recent transactions", "management"],
      ["how are my goals doing?", "management"],
      ["what is section 80C?", "tutor"],
      ["explain what TDS means", "tutor"],
      ["why does the old regime exist?", "tutor"],
    ];
    for (const [q, agent] of confident) {
      const v = keywordVerdict(q);
      expect({ q, ...v }).toMatchObject({ agent, confident: true });
    }
  });

  it("admits when it does not know", () => {
    for (const q of ["help me", "what should I do next?", "hello"]) {
      expect(keywordVerdict(q).confident).toBe(false);
    }
  });

  it("still returns a usable agent when unsure", () => {
    for (const q of ["help me", "hmm", ""]) {
      expect(["tutor", "computation", "management"]).toContain(keywordVerdict(q).agent);
    }
  });
});

describe("follow-up questions", () => {
  it("parses the model's follow-up line and strips it from the answer", async () => {
    const { extractFollowUps } = await import("@/lib/agents/followups");
    const raw = "The new regime is cheaper by \u20B987,880.\nFOLLOWUPS: Why is the old regime worse? | How can I pay less tax? | What is a tax slab?";
    const r = extractFollowUps(raw);
    expect(r.text).not.toContain("FOLLOWUPS");
    expect(r.text).toContain("87,880");
    expect(r.parsed).toHaveLength(3);
    expect(r.parsed[0].text).toBe("Why is the old regime worse?");
    expect(r.parsed[0].kind).toBe("understand");
  });

  it("falls back to the fixed set when the model omits the line", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    const results = [{ tool: "compare_regimes", agent: "computation", component: "regime_comparison",
                       data: null, facts: {}, trace: null, durationMs: 1 }] as never;
    const r = resolveFollowUps("Just an answer with no marker.", "computation", results);
    expect(r.source).toBe("fixed");
    expect(r.suggestions).toHaveLength(3);
  });

  it("ignores a malformed or empty follow-up line", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    const r = resolveFollowUps("Answer.\nFOLLOWUPS:  |  | ", "tutor", [] as never);
    expect(r.source).toBe("fixed");
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("never leaves the marker visible to the user", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    for (const raw of ["A.\nFOLLOWUPS: one two three | four five six", "B.\nfollowups: aaa bbb ccc | ddd eee fff"]) {
      expect(resolveFollowUps(raw, "tutor", [] as never).text).not.toMatch(/followups/i);
    }
  });
});

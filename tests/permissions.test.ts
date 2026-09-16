import { describe, it, expect } from "vitest";
import { callTool } from "@/lib/kernel/tools/execute";
import { ToolPermissionError, UnknownToolError } from "@/lib/kernel/tools/types";
import { AGENT_REGISTRY, AGENT_IDS, mayCall, agentsFor } from "@/lib/kernel/agents";
import { TOOLS, TOOL_NAMES } from "@/lib/kernel/tools/registry";
import { toolsVisibleTo } from "@/lib/kernel/tools/execute";

const ctx = { profileId: "PRIYA-001" };

describe("the wall between agents and the kernel", () => {
  it("refuses when the Tutor reaches for a tax function", async () => {
    await expect(callTool({ agent: "tutor", tool: "compute_tax", args: { regime: "new" }, ctx }))
      .rejects.toBeInstanceOf(ToolPermissionError);
  });

  it("refuses every computation tool to the Tutor, not just one", async () => {
    for (const t of AGENT_REGISTRY.computation.tools) {
      if (AGENT_REGISTRY.tutor.tools.includes(t)) continue;
      await expect(callTool({ agent: "tutor", tool: t, ctx })).rejects.toBeInstanceOf(ToolPermissionError);
    }
  });

  it("refuses concept retrieval to the Computation agent", async () => {
    await expect(callTool({ agent: "computation", tool: "search_concepts", args: { query: "what is 80C" }, ctx }))
      .rejects.toBeInstanceOf(ToolPermissionError);
  });

  it("refuses tax computation to the Management agent", async () => {
    await expect(callTool({ agent: "management", tool: "compute_tax", args: { regime: "new" }, ctx }))
      .rejects.toBeInstanceOf(ToolPermissionError);
  });

  it("rejects a tool that does not exist", async () => {
    await expect(callTool({ agent: "computation", tool: "delete_everything", ctx }))
      .rejects.toBeInstanceOf(UnknownToolError);
  });

  it("every tool named in the registry actually exists", () => {
    for (const id of AGENT_IDS) {
      for (const t of AGENT_REGISTRY[id].tools) expect(TOOL_NAMES).toContain(t);
    }
  });

  it("every tool is reachable by at least one agent", () => {
    for (const name of TOOL_NAMES) expect(agentsFor(name).length).toBeGreaterThan(0);
  });

  it("shows an agent only the tools it may call", () => {
    const seen = toolsVisibleTo("tutor").map((t) => t.name);
    expect(seen.sort()).toEqual([...AGENT_REGISTRY.tutor.tools].sort());
    expect(seen).not.toContain("compute_tax");
  });
});

describe("argument schemas", () => {
  it("rejects a regime that is not new or old", async () => {
    await expect(callTool({ agent: "computation", tool: "compute_tax", args: { regime: "medieval" }, ctx }))
      .rejects.toThrow(/Invalid arguments/);
  });

  it("rejects a negative amount in what_if_deduction", async () => {
    await expect(callTool({ agent: "computation", tool: "what_if_deduction", args: { section: "80C", amount: -5000 }, ctx }))
      .rejects.toThrow(/Invalid arguments/);
  });

  it("no tool accepts an income, balance or turnover from the caller", () => {
    // If a model could pass an income, it could fabricate one. Every figure
    // must be loaded from the profile inside the tool.
    const forbidden = /income|salary|balance|turnover|receipts|networth|net_worth/i;
    for (const spec of Object.values(TOOLS)) {
      const shape = (spec.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      for (const key of Object.keys(shape)) expect(key).not.toMatch(forbidden);
    }
  });
});

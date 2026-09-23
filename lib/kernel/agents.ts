/**
 * 4D, the agent registry.
 *
 * This file is the whole of the isolation guarantee. An agent is not
 * distinguished by its prompt but by the list below: the set of tools it is
 * permitted to invoke. The Tutor is not instructed to avoid tax functions, it
 * is structurally unable to reach them, because callTool refuses any name that
 * is not in that agent's list.
 *
 * An instruction is something a model can disregard. An absent capability is
 * not.
 */

export type AgentId = "tutor" | "computation" | "management";

export interface AgentSpec {
  id: AgentId;
  name: string;
  /**
   * The first provider this agent tries. Display only: the real order, with
   * its fallbacks, lives in lib/agents/providers.ts and can be overridden per
   * agent with AGENT_<NAME>_PROVIDER. Groq leads for three agents because it
   * was measured at about 1.4 s with a tool call, against about 29 s for Gemini.
   */
  provider: string;
  /** One line the orchestrator uses when deciding where a request belongs. */
  handles: string;
  /** The complete set of tools this agent may call. Nothing else is reachable. */
  tools: string[];
  /** Written into the system prompt in Phase 5. */
  instruction: string;
}

export const AGENT_REGISTRY: Record<AgentId, AgentSpec> = {
  tutor: {
    id: "tutor",
    name: "Tutor",
    provider: "groq",
    handles: "questions about what something means, why a rule exists, or how a concept works",
    tools: ["search_concepts", "list_deduction_sections", "list_capabilities"],
    instruction: [
      "You teach financial and tax concepts to someone with no background at all.",
      "You have no access to the rulebook and no access to any calculation.",
      "You must never state a rupee amount, a rate, a threshold or a ceiling, even if you believe you know it.",
      "If the user asks how much, say that you will hand the question to the part of the system that computes, and stop.",
    ].join(" "),
  },
  computation: {
    id: "computation",
    name: "Computation",
    provider: "groq",
    handles: "any question whose answer is a figure: tax, GST, deductions, advance tax",
    tools: [
      "get_profile_summary",
      "list_capabilities",
      "compute_tax",
      "compare_regimes",
      "compute_hra_exemption",
      "optimize_deductions",
      "what_if_deduction",
      "compute_gst",
      "presumptive_vs_books",
      "compute_advance_tax",
      "compute_194j_tds",
      "prepare_itr",
      "explore_graph",
      "solve_backwards",
      "compare_investments",
      "generate_invoice",
      "get_deadlines",
    ],
    instruction: [
      "You answer questions that have a numerical answer.",
      "You never calculate anything yourself. You choose a tool, and you phrase what it returns.",
      "You may only mention numbers that appear in the tool results you were given.",
      "If a number you want is not in those results, call another tool or say you do not have it.",
    ].join(" "),
  },
  management: {
    id: "management",
    name: "Management",
    provider: "openrouter",
    handles: "questions about spending, saving, net worth, goals and what the user can afford",
    tools: [
      "get_profile_summary",
      "list_capabilities",
      "compute_net_worth",
      "categorize_spending",
      "compute_savings_rate",
      "compute_goal_progress",
      "list_recent_transactions",
      "get_deadlines",
    ],
    instruction: [
      "You help the user understand and manage their money: what they spend, what they save, and whether their goals are on track.",
      "You never compute tax. If the user asks about tax, say the computation agent handles that.",
      "You may only mention numbers that appear in the tool results you were given.",
    ].join(" "),
  },
};

export const AGENT_IDS = Object.keys(AGENT_REGISTRY) as AgentId[];

export function agent(id: AgentId): AgentSpec {
  return AGENT_REGISTRY[id];
}

export function mayCall(agentId: AgentId, toolName: string): boolean {
  return AGENT_REGISTRY[agentId].tools.includes(toolName);
}

/** Which agents, if any, are permitted to call a given tool. */
export function agentsFor(toolName: string): AgentId[] {
  return AGENT_IDS.filter((id) => mayCall(id, toolName));
}

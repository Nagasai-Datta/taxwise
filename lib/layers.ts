import { AGENT_REGISTRY, AGENT_IDS } from "./kernel/agents";
export interface Layer {
  id: number; name: string; owns: string; directory: string;
  phase: number; status: "empty" | "built";
}

export const LAYERS: Layer[] = [
  { id: 1, name: "Shell",        owns: "Conversation list, functionality pane, chat, dual-mode toggle, component registry", directory: "app/, components/", phase: 6, status: "built" },
  { id: 2, name: "Orchestrator", owns: "Routes each question to one agent. Computes nothing.",         directory: "lib/orchestrator/", phase: 5, status: "built" },
  { id: 3, name: "Agents",       owns: "Tutor, Computation, Management, separated by the tools each may call.", directory: "lib/agents/", phase: 5, status: "built" },
  { id: 4, name: "Kernel",       owns: "Rule engine, tool registry, memory manager, agent registry.",   directory: "lib/kernel/", phase: 1, status: "built" },
  { id: 5, name: "Data",         owns: "Supabase Postgres behind repositories, with a seed fallback.",  directory: "lib/db/", phase: 2, status: "built" },
];

/**
 * Derived from the agent registry rather than written by hand, so the tool
 * counts shown on /status and by `npm run layers` cannot drift from the code.
 */
const MAY_NOT: Record<string, string> = {
  tutor: "no tax function, no rulebook",
  computation: "no concept retrieval",
  management: "no direct tax computation",
};

export const AGENTS = AGENT_IDS.map((id) => ({
  id,
  name: AGENT_REGISTRY[id].name,
  provider: AGENT_REGISTRY[id].provider,
  may: `${AGENT_REGISTRY[id].tools.length} tools`,
  mayNot: MAY_NOT[id] ?? "",
}));

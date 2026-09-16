export interface Layer {
  id: number; name: string; owns: string; directory: string;
  phase: number; status: "empty" | "built";
}

export const LAYERS: Layer[] = [
  { id: 1, name: "Shell",        owns: "Chat thread, dual-mode toggle, task list, component registry", directory: "app/, components/", phase: 6, status: "built" },
  { id: 2, name: "Orchestrator", owns: "Routes each question to one agent. Computes nothing.",         directory: "lib/orchestrator/", phase: 5, status: "built" },
  { id: 3, name: "Agents",       owns: "Tutor, Computation, Management, each on its own provider.",     directory: "lib/agents/", phase: 5, status: "built" },
  { id: 4, name: "Kernel",       owns: "Rule engine, tool registry, trace recorder, agent registry.",   directory: "lib/kernel/", phase: 1, status: "built" },
  { id: 5, name: "Data",         owns: "Supabase Postgres behind repositories, with a seed fallback.",  directory: "lib/db/", phase: 2, status: "built" },
];

export const AGENTS = [
  { id: "tutor",       name: "Tutor",       provider: "Gemini",     may: "2 tools",  mayNot: "no tax function, no rulebook" },
  { id: "computation", name: "Computation", provider: "Groq",       may: "11 tools", mayNot: "no concept retrieval" },
  { id: "management",  name: "Management",  provider: "OpenRouter", may: "7 tools",  mayNot: "no direct tax computation" },
];

/**
 * The layer manifest.
 *
 * A layer may call the layer below it and never the layer above. This file
 * is the single record of what each layer owns, so the report, the diagrams
 * and the status page all read from one place instead of drifting apart.
 */
export interface Layer {
  id: number; name: string; owns: string; directory: string;
  phase: number; status: "empty" | "built";
}

export const LAYERS: Layer[] = [
  { id: 1, name: "Shell",        owns: "Chat thread, dual-mode toggle, task list, component registry", directory: "app/, components/", phase: 6, status: "empty" },
  { id: 2, name: "Orchestrator", owns: "Routes each question to one agent. Computes nothing.",         directory: "lib/orchestrator/", phase: 5, status: "empty" },
  { id: 3, name: "Agents",       owns: "Tutor, Computation, Management. Separated by permitted tools.", directory: "lib/agents/", phase: 5, status: "empty" },
  { id: 4, name: "Kernel",       owns: "Rule engine, tool registry, memory manager, agent registry.",   directory: "lib/kernel/", phase: 1, status: "built" },
  { id: 5, name: "Data",         owns: "Supabase: Postgres tables and a pgvector table.",               directory: "lib/db/", phase: 2, status: "empty" },
];

export const AGENTS = [
  { id: "tutor",       name: "Tutor",       provider: "Gemini",     may: "searchConcepts only", mayNot: "no tax function, no rulebook" },
  { id: "computation", name: "Computation", provider: "Groq",       may: "11 kernel tools",     mayNot: "no concept retrieval" },
  { id: "management",  name: "Management",  provider: "OpenRouter", may: "6 kernel tools",      mayNot: "no direct tax computation" },
];

import type { z } from "zod";
import type { TraceNode } from "../types";
import type { AgentId } from "../agents";

/** Which component in the Shell registry renders this result. Phase 6 uses these. */
export type ComponentKey =
  | "tax_breakdown"
  | "regime_comparison"
  | "hra_breakdown"
  | "deduction_optimizer"
  | "what_if_diff"
  | "gst_summary"
  | "presumptive_comparison"
  | "advance_tax_schedule"
  | "tds_summary"
  | "net_worth"
  | "spending_breakdown"
  | "savings_rate"
  | "goal_progress"
  | "transaction_list"
  | "deadline_timeline"
  | "profile_summary"
  | "concept_answer"
  | "section_list"
  | "capabilities"
  | "guided_start"
  | "none";

export interface ToolContext {
  profileId: string;
  taskId?: string;
}

/**
 * One entry in the registry.
 *
 * `facts` is the important field. It is the complete set of values the model
 * is permitted to mention in its reply. Anything not in there did not come
 * from the kernel, and the guard in guard.ts rejects it.
 */
export interface ToolSpec<A extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** Shown to the model when it chooses a tool. Written for a reader, not a machine. */
  description: string;
  inputSchema: A;
  component: ComponentKey;
  run: (args: z.infer<A>, ctx: ToolContext) => Promise<{
    data: unknown;
    facts: Record<string, number | string>;
    trace: TraceNode | null;
  }>;
}

export interface ToolResult {
  tool: string;
  agent: AgentId;
  component: ComponentKey;
  data: unknown;
  facts: Record<string, number | string>;
  trace: TraceNode | null;
  durationMs: number;
}

export class ToolPermissionError extends Error {
  constructor(public agentId: AgentId, public toolName: string) {
    super(`Agent "${agentId}" is not permitted to call "${toolName}".`);
    this.name = "ToolPermissionError";
  }
}

export class UnknownToolError extends Error {
  constructor(public toolName: string) {
    super(`No tool named "${toolName}" exists.`);
    this.name = "UnknownToolError";
  }
}

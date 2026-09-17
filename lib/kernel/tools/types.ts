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
  | "input_form"
  | "causal_graph"
  | "inverse_result"
  | "investment_comparison"
  | "invoice"
  | "itr_summary"
  | "none";

/**
 * A tool that cannot answer yet.
 *
 * Until now a tool either ran or failed. Some cannot do either: preparing a
 * return needs figures off a Form 16 that the system has never seen, and
 * guessing them would be worse than asking. So a tool may return a request
 * for input, which the shell renders as a form inside the conversation, and
 * the tool is called again with the answers.
 *
 * The rule still holds. Values typed by a person are not values invented by a
 * model, and they are validated against the same schema as any other argument.
 */
export interface InputField {
  name: string;
  label: string;
  help?: string;
  type: "number" | "text" | "select";
  required?: boolean;
  defaultValue?: string | number;
  options?: { value: string; label: string }[];
  /** Fields sharing a group are drawn under one heading. */
  group?: string;
}

export interface InputRequest {
  title: string;
  description: string;
  submitLabel: string;
  /** The tool to call again once the form is filled. */
  resumeTool: string;
  fields: InputField[];
}

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
    /** Present when the tool needs something before it can answer. */
    needsInput?: InputRequest | null;
    /**
     * Set when the result carries a verdict that a paraphrase could invert.
     *
     * The guard checks figures, not claims. A model given "achievable: no"
     * alongside a required value wrote that the user "would need to invest
     * 1,50,000 to bring tax down to 40,000", which is false, and every figure
     * in that sentence had come from a tool. Where the claim matters more than
     * the numbers, the deterministic phrasing is used instead.
     */
    authoritative?: boolean;
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
  needsInput?: InputRequest | null;
  authoritative?: boolean;
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

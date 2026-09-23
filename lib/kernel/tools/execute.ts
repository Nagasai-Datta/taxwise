import { TOOLS } from "./registry";
import { mayCall, type AgentId } from "../agents";
import { ToolPermissionError, UnknownToolError, type ToolContext, type ToolResult } from "./types";
import { recordToolCall } from "@/lib/db/repositories";

/**
 * The doorway.
 *
 * Everything an agent does to the kernel passes through this one function.
 * It is deliberately the narrowest point in the system, because four things
 * have to be true of every single kernel call and this is where they are made
 * true rather than hoped for:
 *
 *   1. the tool exists
 *   2. this agent is permitted to call it
 *   3. the arguments match the declared schema
 *   4. the call is written to the audit log
 *
 * Step 4 is why the verifiable trace was never separately engineered. A figure
 * cannot reach a user without a row appearing in audit_log first, because
 * there is no other path from an agent to the arithmetic.
 */
export async function callTool(opts: {
  agent: AgentId;
  tool: string;
  args?: Record<string, unknown>;
  ctx: ToolContext;
}): Promise<ToolResult> {
  const { agent, tool, ctx } = opts;

  const spec = TOOLS[tool];
  if (!spec) throw new UnknownToolError(tool);

  // The wall. Not an instruction the model can talk its way around.
  if (!mayCall(agent, tool)) throw new ToolPermissionError(agent, tool);

  const parsed = spec.inputSchema.safeParse(opts.args ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid arguments for ${tool}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const started = Date.now();
  const out = await spec.run(parsed.data, ctx);
  const durationMs = Date.now() - started;

  await recordToolCall({
    profileId: ctx.profileId,
    taskId: ctx.taskId,
    toolName: tool,
    args: parsed.data,
    facts: out.facts,
    trace: out.trace,
    durationMs,
  });

  return {
    tool,
    agent,
    component: out.needsInput ? "input_form" : spec.component,
    data: out.needsInput ?? out.data,
    facts: out.facts,
    trace: out.trace,
    durationMs,
    needsInput: out.needsInput ?? null,
    authoritative: out.authoritative === true,
  };
}

/** The tool descriptions an agent is allowed to see. Used to build prompts in Phase 5. */
export function toolsVisibleTo(agent: AgentId) {
  return Object.values(TOOLS)
    .filter((t) => mayCall(agent, t.name))
    .map((t) => ({ name: t.name, description: t.description, component: t.component }));
}

/**
 * The argument through which a person, not a model, supplies figures.
 *
 * Two tools take a whole record of values: prepare_itr (Form 16 figures) and
 * generate_invoice (the fee and client details). Those values must come from
 * the form the person fills in, never from the model, or the model could
 * invent a salary on a Form 16 and the first enforcement point would be
 * bypassed. This finds that argument from the tool's own schema, so the
 * resume path and the model-facing schema agree without a hand-kept list.
 */
export function userInputArgument(toolName: string): string | null {
  const spec = TOOLS[toolName];
  const shape = (spec?.inputSchema as unknown as { shape?: Record<string, { _def?: { typeName?: string; innerType?: { _def?: { typeName?: string } } } }> })?.shape;
  if (!shape) return null;
  for (const [key, field] of Object.entries(shape)) {
    const def = field?._def;
    const inner = def?.typeName === "ZodOptional" ? def.innerType?._def : def;
    if (inner?.typeName === "ZodRecord") return key;
  }
  return null;
}

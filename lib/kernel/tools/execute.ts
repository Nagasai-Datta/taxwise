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
    component: spec.component,
    data: out.data,
    facts: out.facts,
    trace: out.trace,
    durationMs,
  };
}

/** The tool descriptions an agent is allowed to see. Used to build prompts in Phase 5. */
export function toolsVisibleTo(agent: AgentId) {
  return Object.values(TOOLS)
    .filter((t) => mayCall(agent, t.name))
    .map((t) => ({ name: t.name, description: t.description, component: t.component }));
}

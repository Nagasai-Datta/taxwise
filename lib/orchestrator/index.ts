import { route, seemsLost, type RouteDecision } from "./route";
import { runAgent, type AgentAnswer } from "@/lib/agents/run";
import { createTask, finishTask } from "@/lib/db/repositories";
import { providerSummary } from "@/lib/agents/providers";

export interface OrchestratorResult {
  route: RouteDecision;
  answer: AgentAnswer;
  taskId: string | null;
  providers: ReturnType<typeof providerSummary>;
  totalMs: number;
}

export async function orchestrate(opts: {
  message: string;
  profileId: string;
  /** Skip routing and send this to a named agent. Used by "explain this". */
  forceAgent?: "tutor" | "computation" | "management";
}): Promise<OrchestratorResult> {
  const t0 = Date.now();

  // A request for a starting point is answered with one, rather than being
  // routed to an agent that has no topic to work on.
  const decision = opts.forceAgent
    ? { agent: opts.forceAgent, usedModel: false, ms: 0,
        reason: `Sent straight to the ${opts.forceAgent} agent, because this asks for the ideas behind an answer rather than a new figure` }
    : seemsLost(opts.message)
    ? { agent: "tutor" as const, usedModel: false, ms: 0,
        reason: "This reads as not knowing where to start, so the options are shown instead of an answer" }
    : await route(opts.message);

  const task = await createTask(opts.profileId, opts.message.slice(0, 80), decision.agent);

  const lost = !opts.forceAgent && seemsLost(opts.message);
  const answer = await runAgent({
    agent: decision.agent,
    message: opts.message,
    profileId: opts.profileId,
    taskId: task?.id,
    forceTools: lost ? [{ tool: "list_capabilities", args: { guided: true } }] : undefined,
  });

  if (task) await finishTask(task.id, answer.toolResults.length > 0 ? "completed" : "failed");

  return {
    route: decision,
    answer,
    taskId: task?.id ?? null,
    providers: providerSummary(),
    totalMs: Date.now() - t0,
  };
}

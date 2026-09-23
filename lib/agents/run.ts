import { generateText, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { modelFor, timeoutSignal, optionsFor, MODEL_TIMEOUT_MS } from "./providers";
import { systemPrompt } from "./prompts";
import { AGENT_REGISTRY, type AgentId } from "../kernel/agents";
import { TOOLS } from "../kernel/tools/registry";
import { callTool, userInputArgument } from "../kernel/tools/execute";
import { checkReply, normaliseNumbers } from "../kernel/guard";
import { resolveFollowUps, type FollowUp } from "./followups";
import { applyTurn, asPromptContext, type Note, type NoteKind, type Dossier } from "../kernel/memory";
import { readMemory, writeMemory } from "@/lib/db/repositories";
import { describeResult } from "./describe";
import { pickToolsDeterministically } from "./fallback";
import type { ToolResult } from "../kernel/tools/types";

export interface AgentStep {
  stage: "route" | "select" | "call" | "validate" | "explain";
  usedModel: boolean;
  detail: string;
  ms: number;
}

export interface AgentAnswer {
  agent: AgentId;
  provider: string;
  text: string;
  toolResults: ToolResult[];
  /** The component the Shell should render in interactive mode. */
  component: string;
  steps: AgentStep[];
  guard: { ok: boolean; offending: string[] };
  degraded: boolean;
  /** Follow-up questions offered under the answer. */
  suggestions: FollowUp[];
  suggestionSource: "model" | "fixed";
  /** What was added to the dossier this turn, if anything. */
  remembered: Note | null;
}

/**
 * Run one agent against one question.
 *
 * The model is given only the tools its agent is permitted to call, and each
 * of those tools routes through callTool, which checks permission again and
 * writes to the audit log. So the model cannot reach a tool it should not have
 * even if it invents the name, and it cannot use one without leaving a record.
 *
 * After the model writes its reply, the guard scans it for figures that did not
 * come from a tool result. If it finds any, the reply is discarded and replaced
 * with deterministic phrasing built from the facts. A wrong number is never
 * shown, even once.
 */
export async function runAgent(opts: {
  agent: AgentId;
  message: string;
  profileId: string;
  taskId?: string;
  /**
   * Run exactly these tools and phrase the result, with no model involved.
   * Used when the request is not a question about a topic but a request for a
   * starting point, where there is nothing for a model to decide.
   */
  forceTools?: { tool: string; args?: Record<string, unknown> }[];
}): Promise<AgentAnswer> {
  const { agent, message, profileId, taskId } = opts;
  const steps: AgentStep[] = [];
  const collected: ToolResult[] = [];
  const cache = new Map<string, ToolResult>();
  const ctx = { profileId, taskId };

  // Read before anything else so the model sees it, and so the deterministic
  // path can still record the turn.
  const dossier: Dossier = await readMemory(profileId);
  const memoryContext = asPromptContext(dossier);

  const chosen = opts.forceTools?.length ? null : modelFor(agent);

  /* ------------------------------------------- forced tools, or no provider */
  if (!chosen) {
    if (opts.forceTools?.length) {
      for (const { tool, args } of opts.forceTools) {
        const t = Date.now();
        try {
          const r = await callTool({ agent, tool, args, ctx });
          collected.push(r);
          steps.push({ stage: "call", usedModel: false, detail: `${tool} called directly`, ms: Date.now() - t });
        } catch (e) {
          steps.push({ stage: "call", usedModel: false, detail: e instanceof Error ? e.message : "tool failed", ms: Date.now() - t });
        }
      }
      const text = describeResult(collected);
      const fu = resolveFollowUps("", agent, collected, message);
      await recordTurn(profileId, dossier, collected, null);
      return {
        agent, provider: "deterministic", text, toolResults: collected,
        component: collected[0]?.component ?? "none",
        steps, guard: { ok: true, offending: [] }, degraded: false,
        suggestions: fu.suggestions, suggestionSource: fu.source, remembered: null,
      };
    }
    const t0 = Date.now();
    const names = pickToolsDeterministically(agent, message);
    steps.push({ stage: "select", usedModel: false, detail: `Matched ${names.join(", ") || "nothing"} by keyword. No model available.`, ms: Date.now() - t0 });

    for (const { name, args } of names.map((n) => ({ name: n, args: defaultArgs(n, message) }))) {
      const t = Date.now();
      try {
        const r = await callTool({ agent, tool: name, args, ctx });
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} returned ${Object.keys(r.facts).length} facts`, ms: Date.now() - t });
      } catch (e) {
        steps.push({ stage: "call", usedModel: false, detail: e instanceof Error ? e.message : "tool failed", ms: Date.now() - t });
      }
    }
    const text = describeResult(collected);
    const fu = resolveFollowUps("", agent, collected, message);
    await recordTurn(profileId, dossier, collected, null);
    return {
      agent, provider: "deterministic", text, toolResults: collected,
      component: collected[0]?.component ?? "none",
      steps, guard: { ok: true, offending: [] }, degraded: true,
      suggestions: fu.suggestions, suggestionSource: fu.source,
      remembered: null,
    };
  }

  /* ---------------------------------------------------- model-driven path */
  const permitted = AGENT_REGISTRY[agent].tools;
  const sdkTools: ToolSet = {};

  for (const name of permitted) {
    const spec = TOOLS[name];
    if (!spec) continue;
    /**
     * Figures on a Form 16 or an invoice are typed by the person into a form.
     * The model is shown each such tool without that argument, so the only
     * thing it can do is ask for the form. Anything it sends there anyway is
     * dropped before the call.
     */
    const personOnly = userInputArgument(name);
    const modelSchema = personOnly
      ? (spec.inputSchema as unknown as z.AnyZodObject).omit({ [personOnly]: true } as never)
      : spec.inputSchema;

    sdkTools[name] = tool({
      description: spec.description,
      inputSchema: modelSchema as z.ZodTypeAny,
      execute: async (rawArgs: Record<string, unknown>) => {
        const args = { ...(rawArgs ?? {}) };
        if (personOnly) delete args[personOnly];
        // A model will sometimes call the same tool twice with identical
        // arguments in one turn. The kernel is deterministic, so the second
        // call cannot return anything new; serving it from cache saves the
        // round trip without changing the answer.
        /**
         * Retrieval is capped at one call per turn regardless of arguments.
         * A model asked "what is HRA" called search_concepts twice with
         * slightly different phrasings, paying the embedding cost twice for a
         * corpus of fifty-five documents. One retrieval is enough; a second
         * costs a second and a half and adds nothing.
         */
        const key = name === "search_concepts" ? name : name + ":" + JSON.stringify(args ?? {});
        const cached = cache.get(key);
        if (cached) {
          steps.push({ stage: "call", usedModel: false, detail: name === "search_concepts" ? `${name} already ran this turn, reusing the result` : `${name} served from cache, identical arguments`, ms: 0 });
          return cached.facts;
        }
        const t = Date.now();
        const r = await callTool({ agent, tool: name, args, ctx });
        cache.set(key, r);
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} returned ${Object.keys(r.facts).length} facts`, ms: Date.now() - t });
        // The model sees ONLY the facts, never the full data structure. It
        // cannot quote a number it was not explicitly handed.
        return r.facts;
      },
    });
  }

  const t0 = Date.now();
  let text = "";
  let modelFailed = false;

  /**
   * A model sometimes fails in a way that a second attempt fixes. Groq was
   * observed calling a tool named "preservative_vs_books" instead of
   * "presumptive_vs_books", which its own validator rejected. One retry
   * recovers that at the cost of a single extra call. A timeout is not
   * retried, because whatever made it slow will still be slow.
   */
  const attempt = async () => generateText({
      model: chosen.model,
      system: systemPrompt(agent, memoryContext),
      prompt: message,
      tools: sdkTools,
      stopWhen: stepCountIs(4),
      temperature: 0.2,
      abortSignal: timeoutSignal(),
      providerOptions: optionsFor(chosen.provider),
    });

  try {
    let res;
    try {
      res = await attempt();
    } catch (first) {
      const msg = first instanceof Error ? first.message : "";
      const retryable = !/abort|timeout|timed out/i.test(msg);
      if (!retryable) throw first;
      steps.push({ stage: "select", usedModel: true, detail: `First attempt failed (${msg.slice(0, 70)}). Retrying once.`, ms: Date.now() - t0 });
      res = await attempt();
    }
    text = (res.text ?? "").trim();
    steps.push({ stage: "explain", usedModel: true, detail: `${chosen.provider} produced ${text.length} characters after ${collected.length} tool call(s)`, ms: Date.now() - t0 });
  } catch (e) {
    modelFailed = true;
    const msg = e instanceof Error ? e.message : "unknown";
    const timedOut = /abort|timeout|timed out/i.test(msg);
    steps.push({
      stage: "explain", usedModel: true,
      detail: timedOut
        ? `Model exceeded ${MODEL_TIMEOUT_MS}ms and was abandoned. Answering deterministically instead.`
        : `Model call failed: ${msg}. Falling back.`,
      ms: Date.now() - t0,
    });
  }

  /* ---------------- the model produced nothing useful, or called no tools */
  if (modelFailed || collected.length === 0) {
    const names = pickToolsDeterministically(agent, message);
    for (const name of names) {
      if (collected.some((c) => c.tool === name)) continue;
      try {
        const r = await callTool({ agent, tool: name, args: defaultArgs(name, message), ctx });
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} called by keyword fallback`, ms: 0 });
      } catch { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------- the guard */
  const tg = Date.now();
  const factList = collected.map((c) => c.facts);

  // Pull the model's own lines off before anything inspects the answer.
  const note = extractNote(text);
  if (note) text = text.replace(NOTE_LINE, "").trim();
  const fu = resolveFollowUps(text, agent, collected, message);
  text = fu.text;

  /**
   * Normalise before checking, not after.
   *
   * A model writes "2.4 million" where a tool returned 2400000. Checking first
   * rejects a reply that was never wrong, only differently scaled. Normalising
   * first resolves the scale, and anything that still does not match a tool
   * result is a genuine invention and is still rejected.
   */
  if (text) text = normaliseNumbers(text, factList);
  const guard = checkReply(text, factList);
  let degraded = modelFailed;

  /**
   * A verdict the model could invert. Its phrasing is discarded before the
   * guard even runs, because the guard would pass it: every figure would be
   * real and only the claim would be wrong.
   */
  const authoritative = collected.some((c) => c.authoritative);
  if (authoritative && text) {
    text = describeResult(collected);
    steps.push({
      stage: "validate", usedModel: false,
      detail: "This result carries a verdict a paraphrase could reverse, so it was worded from the figures rather than by the model.",
      ms: 0,
    });
  }

  if (!text || !guard.ok) {
    text = describeResult(collected);
    degraded = true;
    steps.push({
      stage: "validate", usedModel: false,
      detail: guard.ok ? "Model returned no text. Using deterministic phrasing."
        : `Rejected: ${guard.offending.join(", ")} did not come from any tool result. Using deterministic phrasing.`,
      ms: Date.now() - tg,
    });
  } else {
    steps.push({
      stage: "validate", usedModel: false,
      detail: "Every figure in the reply traces to a tool result, in Indian digit grouping.",
      ms: Date.now() - tg,
    });
  }

  await recordTurn(profileId, dossier, collected, note);

  return {
    agent, provider: chosen.provider, text, toolResults: collected,
    component: collected[0]?.component ?? "none",
    steps, guard: { ok: guard.ok, offending: guard.offending }, degraded,
    suggestions: fu.suggestions, suggestionSource: fu.source,
    remembered: note,
  };
}

/** Reasonable arguments when a tool is chosen by keyword rather than by the model. */
function defaultArgs(name: string, message: string): Record<string, unknown> {
  const m = message.toLowerCase();
  if (name === "compute_tax") return { regime: /\bold\b/.test(m) ? "old" : "new" };
  if (name === "search_concepts") return { query: message.slice(0, 300) };
  if (name === "list_recent_transactions") return { limit: 10 };
  return {};
}

/* --------------------------------------------------------------- memory */

const NOTE_LINE = /^[ \t]*REMEMBER[ \t]*:[ \t]*(preference|decision|question|fact)[ \t]*\|[ \t]*(.+)$/im;

/**
 * The model may offer one durable note per turn on a final line. It is parsed
 * strictly and dropped if malformed, because a half-understood note in a
 * dossier is worse than no note at all.
 */
export function extractNote(raw: string): Note | null {
  const m = raw.match(NOTE_LINE);
  if (!m) return null;
  const text = m[2].trim().replace(/[.\s]+$/, "");
  if (text.length < 4 || text.length > 120) return null;
  // A note is about the person, not about a figure.
  if (/\d[\d,]{3,}/.test(text)) return null;
  return { kind: m[1].toLowerCase() as NoteKind, text, at: new Date().toISOString() };
}

/**
 * Fold the turn into the dossier and store it.
 *
 * Concepts and tools are recorded from what actually ran, not from what the
 * model claims. Only the free-text note comes from the model, and even that is
 * parsed strictly.
 *
 * Failures are swallowed: losing a dossier update must never cost the user a
 * correct answer they are waiting for.
 */
async function recordTurn(
  profileId: string,
  prev: Dossier,
  results: ToolResult[],
  note: Note | null
): Promise<void> {
  try {
    const concepts: { id: string; title: string }[] = [];
    for (const r of results) {
      if (r.tool !== "search_concepts") continue;
      const d = r.data as { results?: { id: string; title: string }[] } | null;
      for (const c of d?.results ?? []) concepts.push({ id: c.id, title: c.title });
    }
    const next = applyTurn(prev, {
      concepts,
      tools: results.map((r) => r.tool),
      note,
    });
    await writeMemory(profileId, next);
  } catch { /* never block an answer */ }
}

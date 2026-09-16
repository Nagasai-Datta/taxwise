import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, JSONValue } from "ai";
import type { AgentId } from "../kernel/agents";

/**
 * Provider wiring.
 *
 * Three providers, one per agent, which is what the architecture diagram
 * specifies. The point is not redundancy for its own sake: because the kernel
 * performs every calculation, the choice of model cannot alter a single
 * figure. Running three different companies' models side by side and getting
 * identical numbers is the clearest demonstration of that guarantee available,
 * and it happens to give three independent rate-limit budgets as well.
 *
 * Model identifiers come from the environment with defaults, because providers
 * retire models on their own schedule. Groq retired the Llama chat models in
 * June 2026 and Google retired gemini-2.0-flash, both during this build.
 * Run `npm run providers` to see what your keys can actually reach.
 */

export const MODELS = {
  groq: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
  gemini: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  // No default. OpenRouter's free catalogue changes weekly, so a hardcoded id
  // would be a liability rather than a convenience. `npm run providers` lists
  // the free models that support tool calling and tells you what to set.
  openrouter: process.env.OPENROUTER_MODEL ?? "",
} as const;

export function hasGroq(): boolean {
  return !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10;
}
export function hasGemini(): boolean {
  const k = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return !!k && k.length > 10;
}
export function hasOpenRouter(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return !!k && k.length > 10 && MODELS.openrouter.length > 0;
}
export function hasAnyProvider(): boolean {
  return hasGroq() || hasGemini() || hasOpenRouter();
}

function groqModel(): LanguageModel | null {
  if (!hasGroq()) return null;
  return createGroq({ apiKey: process.env.GROQ_API_KEY as string })(MODELS.groq);
}

function geminiModel(): LanguageModel | null {
  if (!hasGemini()) return null;
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string })(MODELS.gemini);
}

function openrouterModel(): LanguageModel | null {
  if (!hasOpenRouter()) return null;
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY as string })(MODELS.openrouter);
}

/**
 * Which provider serves which agent, and what it falls back to.
 *
 * Routing and computation go to Groq because both are short prompts where
 * latency is what the user actually feels. Teaching goes to Gemini, which
 * writes better prose. Management goes to OpenRouter when configured, which
 * matches the architecture diagram and keeps the third quota bucket separate.
 *
 * Every agent falls back through the other providers, and if none is reachable
 * the caller drops to deterministic behaviour with every figure unchanged.
 */
type ProviderName = "groq" | "gemini" | "openrouter";

/**
 * Which provider serves which agent.
 *
 * The defaults below put Groq first for every agent a person is waiting on,
 * because it is the only one measured under four seconds with a tool call.
 * Gemini 3.6 exceeded a twelve second timeout on a Tutor question even with
 * thinking set to minimal, so it is no longer in front of a user. It still
 * earns its place: it produces the embeddings for concept retrieval, where a
 * single 700ms call before anyone is waiting costs nothing.
 *
 * Run `npm run bench` on your own connection and override if your numbers
 * differ. The kernel computes every figure, so provider choice cannot change
 * an answer, only how quickly it is worded.
 */
const DEFAULT_PREFERENCE: Record<AgentId | "orchestrator", ProviderName[]> = {
  orchestrator: ["groq", "openrouter", "gemini"],
  computation:  ["groq", "openrouter", "gemini"],
  tutor:        ["groq", "openrouter", "gemini"],
  management:   ["openrouter", "groq", "gemini"],
};

function envOverride(who: AgentId | "orchestrator"): ProviderName[] | null {
  const key = "AGENT_" + who.toUpperCase() + "_PROVIDER";
  const raw = process.env[key];
  if (!raw) return null;
  const wanted = raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) as ProviderName[];
  const valid = wanted.filter((w) => ["groq", "gemini", "openrouter"].includes(w));
  if (valid.length === 0) return null;
  // Anything not named still follows as a fallback, so an override can never
  // leave an agent with no provider at all.
  const rest = DEFAULT_PREFERENCE[who].filter((p) => !valid.includes(p));
  return [...valid, ...rest];
}

export function modelFor(who: AgentId | "orchestrator"): { model: LanguageModel; provider: string } | null {
  const order = envOverride(who) ?? DEFAULT_PREFERENCE[who];
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    const m = name === "groq" ? groqModel() : name === "gemini" ? geminiModel() : openrouterModel();
    if (m) {
      const id = name === "groq" ? MODELS.groq : name === "gemini" ? MODELS.gemini : MODELS.openrouter;
      return { model: m, provider: `${name}:${id}${i > 0 ? " (fallback)" : ""}` };
    }
  }
  return null;
}

export function providerSummary() {
  return {
    groq: hasGroq() ? MODELS.groq : null,
    gemini: hasGemini() ? MODELS.gemini : null,
    openrouter: hasOpenRouter() ? MODELS.openrouter : null,
    orchestrator: modelFor("orchestrator")?.provider ?? "deterministic",
    tutor: modelFor("tutor")?.provider ?? "deterministic",
    computation: modelFor("computation")?.provider ?? "deterministic",
    management: modelFor("management")?.provider ?? "deterministic",
  };
}

/**
 * How long any single model call may take before it is abandoned.
 *
 * Measured, not guessed: a Gemini 3.x model answering a Tutor question took
 * thirty seconds because it reasons before replying by default. Thirty seconds
 * of silence in front of an examiner is not survivable, and the deterministic
 * fallback answers correctly in milliseconds, so waiting is never worth it.
 */
export const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 12000);

export function timeoutSignal(ms = MODEL_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Provider-specific settings applied to every call.
 *
 * Gemini 2.5 and later think before answering unless told otherwise. For
 * choosing a tool and phrasing a result there is nothing to think about, so
 * the budget is set to minimal. This is the single change that took a Tutor
 * reply from thirty seconds to a few.
 */
export function optionsFor(provider: string): Record<string, Record<string, JSONValue>> | undefined {
  if (provider.startsWith("gemini")) {
    return { google: { thinkingConfig: { thinkingLevel: "minimal" } } };
  }
  return undefined;
}

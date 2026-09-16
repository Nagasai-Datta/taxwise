import { generateText } from "ai";
import { modelFor, timeoutSignal, optionsFor } from "@/lib/agents/providers";
import { ROUTER_PROMPT } from "@/lib/agents/prompts";
import { AGENT_IDS, type AgentId } from "@/lib/kernel/agents";

export interface RouteDecision {
  agent: AgentId;
  usedModel: boolean;
  reason: string;
  ms: number;
}

export interface KeywordVerdict {
  agent: AgentId;
  /** True when an unambiguous domain signal was present. */
  confident: boolean;
  matched: string;
}

/**
 * Layer 2. One responsibility: decide whose job this is.
 *
 * The model is consulted only when the deterministic router is unsure.
 *
 * That order is deliberate and was arrived at by measurement rather than
 * preference. A small model asked to classify "which regime is better for me"
 * answered "tutor", which is wrong, while a single keyword match on "regime"
 * answers correctly every time. Where a question contains an unambiguous
 * domain word there is nothing for a model to add, and three costs to letting
 * it try: latency of about a second, one request against a rate limit that is
 * the binding constraint on this project, and the chance of being overruled
 * by a worse answer.
 *
 * So the model is reserved for genuinely vague questions, which is where it is
 * actually better than a keyword.
 */
export async function route(message: string): Promise<RouteDecision> {
  const t0 = Date.now();
  const verdict = keywordVerdict(message);

  if (verdict.confident) {
    return {
      agent: verdict.agent,
      usedModel: false,
      reason: `"${verdict.matched}" is unambiguous, so no model was needed`,
      ms: Date.now() - t0,
    };
  }

  const chosen = modelFor("orchestrator");
  if (chosen) {
    try {
      const res = await generateText({
        model: chosen.model,
        system: ROUTER_PROMPT,
        prompt: message,
        temperature: 0,
        // Routing is a single word. It must never be the slow part.
        abortSignal: timeoutSignal(6000),
        providerOptions: optionsFor(chosen.provider),
      });
      const word = (res.text ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const hit = AGENT_IDS.find((a) => word.includes(a));
      if (hit) {
        return { agent: hit, usedModel: true, reason: `Question was ambiguous, ${chosen.provider} chose ${hit}`, ms: Date.now() - t0 };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    agent: verdict.agent,
    usedModel: false,
    reason: chosen ? `Ambiguous and the model did not answer usefully, defaulted to ${verdict.agent}` : `No model available, defaulted to ${verdict.agent}`,
    ms: Date.now() - t0,
  };
}

/**
 * Someone who does not know where to begin.
 *
 * These phrasings currently route to the Tutor and get a poor answer, because
 * there is no concept to retrieve. They are not questions about a topic, they
 * are a request for a starting point, so they are answered with one instead.
 */
const LOST = [
  /^\s*(help|hi|hello|hey|start|begin)\s*[!.?]*\s*$/i,
  /\b(what (can|should) (i|you) (ask|do)|where (do|should) i (start|begin))\b/i,
  /\b(i (don'?t|do not) (know|understand)|no idea|i'?m lost|confused|guide me|help me)\b/i,
  /\b(what (else )?can (this|you|it) do|what (are|is) (my|the) options|show me everything)\b/i,
];

export function seemsLost(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return true;
  return LOST.some((re) => re.test(m));
}

/* ---------------------------------------------------------------- signals */

const MANAGEMENT = /\b(spend|spending|spent|expense|expenses|budget|goals?|net worth|afford|savings? rate|transactions?|balance)\b/;
const COMPUTATION = /\b(tax|gst|regimes?|deductions?|80c|80d|80ccd|24b|80tta|hra|194j|advance tax|presumptive|44ad|44ada|owe|liability|cess|rebate|slab|form 16|itr)\b/;
const CONCEPTUAL = /\b(explain|meaning|means|what does|what is a|difference between|why do|why does|how does .* work)\b/;
const PERSONAL = /\b(my|mine|i|me)\b/;
const HOW_MUCH = /\bhow (much|many)\b/;

/**
 * The deterministic router, with an explicit confidence signal.
 *
 * Confident means a domain word was present that only one agent could own.
 * Unconfident answers still return an agent, because the caller needs
 * something to fall back to, but they invite the model to have an opinion.
 */
export function keywordVerdict(message: string): KeywordVerdict {
  const m = message.toLowerCase();
  const personal = PERSONAL.test(m);
  const asksHowMuch = HOW_MUCH.test(m);

  // A definitional question about a concept, with no reference to the user's
  // own position, belongs to the Tutor even when it names a tax section.
  // "What is 80C" teaches; "how much 80C do I have left" computes.
  const definitional =
    (/^\s*(what|why) (is|are|does|do)\b/.test(m) || CONCEPTUAL.test(m)) && !personal && !asksHowMuch;
  if (definitional) {
    return { agent: "tutor", confident: true, matched: "a definitional question with no reference to your own figures" };
  }

  const mgmt = m.match(MANAGEMENT);
  if (mgmt) return { agent: "management", confident: true, matched: mgmt[0] };

  const comp = m.match(COMPUTATION);
  if (comp) return { agent: "computation", confident: true, matched: comp[0] };

  if (asksHowMuch || /\b(calculate|compute|work out)\b/.test(m)) {
    return { agent: "computation", confident: false, matched: "asks for a figure but names no domain" };
  }

  return { agent: "tutor", confident: false, matched: "no domain signal" };
}

/** Kept for tests and callers that only want the agent. */
export function routeByKeyword(message: string): AgentId {
  return keywordVerdict(message).agent;
}

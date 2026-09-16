/**
 * Times each provider on a realistic tool-calling turn.
 *
 *   npm run bench
 *
 * This exists because a guess was wrong. Gemini 3.6 was assumed to be slow
 * because it reasons before answering, so thinking was set to minimal. It made
 * no measurable difference and the Tutor still exceeded the timeout. Rather
 * than guess again, this measures, so the provider assignment can be chosen on
 * evidence rather than on a plausible story.
 */
import "../lib/env";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MODELS, hasGroq, hasGemini, hasOpenRouter, optionsFor } from "../lib/agents/providers";
import type { LanguageModel } from "ai";

const RUNS = Number(process.env.BENCH_RUNS ?? 2);
const CAP_MS = 30000;

// A prompt that forces one tool call and a short written answer, which is
// exactly the shape of a real turn in this system.
const SYSTEM = "You explain things plainly. Call the tool, then answer in two short sentences using only what it returned. Never invent a number.";
const PROMPT = "Look up what house rent allowance is, then explain it to someone who has never filed a tax return.";

function lookupTool() {
  return {
    lookup_concept: tool({
      description: "Look up an explanation of a financial concept.",
      inputSchema: z.object({ term: z.string().describe("The concept to look up.") }),
      execute: async ({ term }: { term: string }) => ({
        term,
        explanation:
          "House rent allowance is a part of salary meant to cover rent. If the employee actually pays rent, part of the allowance is exempt from tax. The exempt amount is the least of three quantities defined by the rules.",
      }),
    }),
  };
}

async function timeOne(label: string, model: LanguageModel, providerTag: string) {
  const times: number[] = [];
  let calledTool = false;
  let failure = "";

  for (let i = 0; i < RUNS; i++) {
    const t = Date.now();
    try {
      const res = await generateText({
        model,
        system: SYSTEM,
        prompt: PROMPT,
        tools: lookupTool(),
        stopWhen: stepCountIs(3),
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(CAP_MS),
        providerOptions: optionsFor(providerTag),
      });
      times.push(Date.now() - t);
      if (res.steps?.some((s) => (s.toolCalls ?? []).length > 0)) calledTool = true;
    } catch (e) {
      times.push(Date.now() - t);
      failure = e instanceof Error ? e.message.slice(0, 70) : "unknown";
      break;
    }
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const verdict = failure
    ? "FAILED  " + failure
    : avg < 4000 ? "fast"
    : avg < 8000 ? "usable"
    : avg < 12000 ? "slow, close to the timeout"
    : "too slow to use";

  console.log(
    "  " + label.padEnd(13) +
    (String(avg) + "ms").padStart(8) + "   " +
    times.map((t) => t + "ms").join(", ").padEnd(22) +
    (calledTool ? "tool ok  " : "NO TOOL  ") + verdict
  );
  return { label, avg, calledTool, failure };
}

async function main() {
  console.log("");
  console.log(`PROVIDER LATENCY   ${RUNS} runs each, one tool call plus a short answer`);
  console.log("");
  console.log("  provider          average   individual runs         result");
  console.log("  " + "-".repeat(74));

  const results = [];

  if (hasGroq()) {
    const m = createGroq({ apiKey: process.env.GROQ_API_KEY as string })(MODELS.groq);
    results.push(await timeOne("groq", m, "groq"));
  } else console.log("  groq          no key");

  if (hasGemini()) {
    const m = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string })(MODELS.gemini);
    results.push(await timeOne("gemini", m, "gemini"));
  } else console.log("  gemini        no key");

  if (hasOpenRouter()) {
    const m = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY as string })(MODELS.openrouter);
    results.push(await timeOne("openrouter", m, "openrouter"));
  } else console.log("  openrouter    no key or no OPENROUTER_MODEL set");

  console.log("");
  const usable = results.filter((r) => !r.failure && r.calledTool && r.avg < 8000).sort((a, b) => a.avg - b.avg);

  if (usable.length === 0) {
    console.log("  No provider answered fast enough. Every agent will use deterministic");
    console.log("  phrasing, which is correct but plainer. Figures are unaffected.");
  } else {
    console.log(`  Fastest usable: ${usable[0].label} at about ${usable[0].avg}ms.`);
    console.log("");
    console.log("  Put the fastest provider in front for the agents a person waits on.");
    console.log("  To override the assignment, add to .env.local:");
    console.log("");
    console.log("    AGENT_TUTOR_PROVIDER=" + usable[0].label);
    console.log("    AGENT_COMPUTATION_PROVIDER=" + usable[0].label);
    console.log("    AGENT_MANAGEMENT_PROVIDER=" + (usable[1]?.label ?? usable[0].label));
  }
  console.log("");
  console.log("  A provider that is slow here is not useless: Gemini also produces the");
  console.log("  embeddings for concept retrieval, where 700ms once is irrelevant.");
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

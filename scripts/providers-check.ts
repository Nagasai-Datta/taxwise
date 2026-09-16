/**
 * Asks each provider what models your keys can actually reach, then runs a
 * live tool-calling test with the configured model.
 *
 *   npm run providers
 *
 * This exists because providers retire models on their own schedule. Groq
 * retired the Llama chat models in June 2026. Rather than trust any hardcoded
 * identifier, this asks.
 */
import "../lib/env";
import { MODELS, hasGroq, hasGemini, hasOpenRouter, modelFor } from "../lib/agents/providers";
import { generateText, tool } from "ai";
import { z } from "zod";

async function groqModels(): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.data ?? []).map((m: { id: string }) => m.id).sort();
}

async function geminiModels(): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: { name: string }) => m.name.replace("models/", ""))
    // Drop image, audio and specialist endpoints: this project needs a chat
    // model that can call tools, and listing forty options helps nobody.
    .filter((id: string) => !/image|tts|transcribe|embedding|computer-use|deep-research|antigravity/.test(id))
    .sort();
}

/**
 * OpenRouter's free catalogue changes constantly, so this asks rather than
 * assumes. The endpoint filters by tool support server side, which is the one
 * capability this project cannot do without.
 */
async function openrouterFreeToolModels(): Promise<string[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.data ?? [])
    .filter((m: { pricing?: { prompt?: string; completion?: string } }) =>
      Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0)
    .map((m: { id: string }) => m.id)
    .sort();
}

async function smokeTest(label: string, who: "orchestrator" | "computation" | "tutor" | "management") {
  const chosen = modelFor(who);
  if (!chosen) { console.log(`  ${label.padEnd(14)} no provider`); return; }
  try {
    const res = await generateText({
      model: chosen.model,
      system: "You must call the add_two tool. Do not answer directly.",
      prompt: "Use the tool with a=2 and b=3.",
      tools: {
        add_two: tool({
          description: "Adds two numbers.",
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
        }),
      },
      temperature: 0,
    });
    const called = res.steps?.some((s) => (s.toolCalls ?? []).length > 0);
    console.log(`  ${label.padEnd(14)} ${chosen.provider.padEnd(34)} ${called ? "tool calling works" : "responded, but did NOT call the tool"}`);
  } catch (e) {
    console.log(`  ${label.padEnd(14)} ${chosen.provider.padEnd(34)} FAILED: ${e instanceof Error ? e.message.slice(0, 90) : "unknown"}`);
  }
}

async function main() {
  console.log("");
  console.log("PROVIDERS");
  console.log("");
  console.log(`  GROQ_API_KEY                    ${hasGroq() ? "present" : "MISSING"}`);
  console.log(`  GOOGLE_GENERATIVE_AI_API_KEY    ${hasGemini() ? "present" : "MISSING"}`);
  console.log(`  OPENROUTER_API_KEY              ${process.env.OPENROUTER_API_KEY ? "present" : "missing (optional)"}`);
  console.log("");
  console.log(`  configured Groq model           ${MODELS.groq}`);
  console.log(`  configured Gemini model         ${MODELS.gemini}`);
  console.log(`  configured OpenRouter model     ${MODELS.openrouter || "not set"}`);
  console.log("");

  if (hasGroq()) {
    try {
      const ids = await groqModels();
      const ok = ids.includes(MODELS.groq);
      console.log(`  Groq reports ${ids.length} models. Configured model present: ${ok ? "yes" : "NO"}`);
      if (!ok) {
        console.log("");
        console.log("  Available Groq models:");
        for (const id of ids) console.log("    " + id);
        console.log("");
        console.log("  Pick one and add it to .env.local:   GROQ_MODEL=<id>");
      }
    } catch (e) {
      console.log("  Groq model list failed: " + (e instanceof Error ? e.message.slice(0, 120) : "unknown"));
    }
    console.log("");
  }

  if (hasGemini()) {
    try {
      const ids = await geminiModels();
      const ok = ids.includes(MODELS.gemini);
      console.log(`  Gemini reports ${ids.length} models. Configured model present: ${ok ? "yes" : "NO"}`);
      if (!ok) {
        console.log("");
        console.log("  Gemini chat models your key can reach:");
        for (const id of ids) console.log("    " + id);
        console.log("");
        console.log("  Pick one and add it to .env.local:   GEMINI_MODEL=<id>");
      }
    } catch (e) {
      console.log("  Gemini model list failed: " + (e instanceof Error ? e.message.slice(0, 120) : "unknown"));
    }
    console.log("");
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const ids = await openrouterFreeToolModels();
      if (!MODELS.openrouter) {
        console.log(`  OpenRouter has ${ids.length} free models that support tool calling.`);
        console.log("");
        console.log("  Pick one and add it to .env.local as OPENROUTER_MODEL=<id>");
        console.log("  Until you do, the Management agent stays on Gemini and nothing breaks.");
        console.log("");
        for (const id of ids.slice(0, 20)) console.log("    " + id);
        if (ids.length > 20) console.log(`    ... and ${ids.length - 20} more`);
      } else {
        const ok = ids.includes(MODELS.openrouter);
        console.log(`  OpenRouter reports ${ids.length} free tool-calling models. Configured model present: ${ok ? "yes" : "NO"}`);
        if (!ok) {
          console.log("");
          console.log("  Free models that support tool calling:");
          for (const id of ids.slice(0, 20)) console.log("    " + id);
        }
      }
    } catch (e) {
      console.log("  OpenRouter model list failed: " + (e instanceof Error ? e.message.slice(0, 120) : "unknown"));
    }
    console.log("");
  }

  console.log("LIVE TOOL-CALLING TEST");
  console.log("");
  await smokeTest("orchestrator", "orchestrator");
  await smokeTest("computation", "computation");
  await smokeTest("tutor", "tutor");
  await smokeTest("management", "management");
  console.log("");
  console.log("  Tool calling is the one capability this project cannot work without.");
  console.log("  If a model responds but does not call the tool, choose a different one.");
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

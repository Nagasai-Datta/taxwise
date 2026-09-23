/**
 * Evaluation runner for the paper.
 *
 *   npm run eval                                  run everything not yet done
 *   npm run eval -- --only platform-nomodel       one condition
 *   npm run eval -- --runs 3                      repeats per question (default 3)
 *   npm run eval -- --ids P01,A07                 only some questions
 *
 * Four conditions, each answering the same 30 questions:
 *
 *   platform-model     the platform as built, with its language model
 *   platform-nomodel   the same platform with every model key removed
 *   baseline-rules     the same model with no tools, given the profile and the
 *                      full FY 2025-26 rulebook in its prompt
 *   baseline-plain     the same model with no tools, given the profile only
 *
 * Every answer is appended to eval/results/<condition>.jsonl as soon as it
 * arrives. If the run stops (a rate limit, a closed laptop), running the same
 * command again skips what is already done and carries on.
 *
 * The evaluation uses the seed data, never Supabase, so that every run starts
 * from the same state and nothing is written to the database.
 */
import "./_env";
import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { orchestrate } from "../lib/orchestrator";
import { MODELS, hasGroq } from "../lib/agents/providers";
import type { Question } from "./score";

const ROOT = path.resolve(__dirname);
const RESULTS = path.join(ROOT, "results");
const QUESTIONS: Question[] = JSON.parse(fs.readFileSync(path.join(ROOT, "questions.json"), "utf8")).questions;
const PROFILES = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "data", "profiles.json"), "utf8"));
const RULES_TEXT = fs.readFileSync(path.join(ROOT, "..", "data", "tax_rules.json"), "utf8");

const CONDITIONS = ["platform-model", "platform-nomodel", "baseline-rules", "baseline-plain"] as const;
type Condition = (typeof CONDITIONS)[number];

/* ------------------------------------------------------------ arguments */

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const RUNS = Number(flag("--runs") ?? 3);
const ONLY = flag("--only")?.split(",") as Condition[] | undefined;
const IDS = flag("--ids")?.split(",");
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 2500);
const BASELINE_TIMEOUT_MS = 60000;

/* ------------------------------------------------------------ helpers */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The model keys, captured once so they can be removed and restored. */
const KEYS = ["GROQ_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENROUTER_API_KEY"] as const;
const savedKeys: Record<string, string | undefined> = {};
for (const k of KEYS) savedKeys[k] = process.env[k];
function modelsOff() { for (const k of KEYS) process.env[k] = ""; }
function modelsOn() { for (const k of KEYS) process.env[k] = savedKeys[k] ?? ""; }

function done(condition: Condition): Set<string> {
  const file = path.join(RESULTS, `${condition}.jsonl`);
  const seen = new Set<string>();
  if (!fs.existsSync(file)) return seen;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); seen.add(`${r.id}|${r.run}`); } catch { /* skip a torn line */ }
  }
  return seen;
}

function append(condition: Condition, row: Record<string, unknown>) {
  fs.appendFileSync(path.join(RESULTS, `${condition}.jsonl`), JSON.stringify(row) + "\n");
}

function isRateLimit(msg: string): boolean {
  return /rate.?limit|429|too many requests|quota|tokens per (minute|day)|requests per (minute|day)/i.test(msg);
}

/** How long a provider asked us to wait, if it said. Otherwise a minute. */
function waitFor(msg: string): number {
  const s = msg.match(/try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i);
  if (s) return Math.ceil((Number(s[1] ?? 0) * 60 + Number(s[2])) * 1000) + 2000;
  return 60000;
}

/** The profile as the baseline model sees it: the same data the kernel reads. */
function profileFor(id: string): string {
  const p = PROFILES.profiles.find((x: { id: string }) => x.id === id);
  const { bank, businessBank, exercises, ...rest } = p;
  return JSON.stringify({ ...rest, assumptions: PROFILES._meta.assumptions }, null, 2);
}

/* ------------------------------------------------------ the platform */

async function askPlatform(q: Question, condition: Condition) {
  const t0 = Date.now();
  const r = await orchestrate({ message: q.question, profileId: q.profile });
  const steps = r.answer.steps.map((s) => `${s.stage}:${s.usedModel ? "model" : "none"}:${s.detail}`);
  return {
    text: r.answer.text,
    latencyMs: Date.now() - t0,
    route: { agent: r.route.agent, usedModel: r.route.usedModel, ms: r.route.ms },
    provider: r.answer.provider,
    tools: r.answer.toolResults.map((t) => ({ tool: t.tool, facts: t.facts })),
    guardOk: r.answer.guard.ok,
    guardOffending: r.answer.guard.offending,
    degraded: r.answer.degraded,
    steps,
    // A provider refusing us for quota is not the behaviour being measured.
    // The platform quietly falls back when that happens, so it is detected
    // here and the question is retried after waiting.
    rateLimited: condition === "platform-model" && steps.some((s) => isRateLimit(s)),
  };
}

/* ------------------------------------------------------ the baseline */

const BASELINE_SYSTEM =
  "You are a knowledgeable assistant for Indian personal finance and income tax. " +
  "Answer for financial year 2025-26 (assessment year 2026-27) under the Income-tax Act, 1961, and the GST law in force for that year. " +
  "Use the person's profile below. Show brief working. " +
  "End your reply with one final line of the form 'ANSWER: <value>', where <value> is a single rupee figure written in digits, " +
  "or 'yes' or 'no' for a yes-or-no question, or 'not reachable' if the target in the question cannot be reached.";

async function askBaseline(q: Question, withRules: boolean) {
  const model = createGroq({ apiKey: process.env.GROQ_API_KEY as string })(MODELS.groq);
  const prompt =
    `My profile:\n${profileFor(q.profile)}\n\n` +
    (withRules ? `The tax rules for FY 2025-26, as a JSON rulebook:\n${RULES_TEXT}\n\n` : "") +
    `Question: ${q.question}`;
  const t0 = Date.now();
  const res = await generateText({
    model,
    system: BASELINE_SYSTEM,
    prompt,
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(BASELINE_TIMEOUT_MS),
  });
  return {
    text: (res.text ?? "").trim(),
    latencyMs: Date.now() - t0,
    provider: `groq:${MODELS.groq}`,
    usage: res.usage,
    rateLimited: false,
  };
}

/* ------------------------------------------------------------ main */

async function runCondition(condition: Condition) {
  const seen = done(condition);
  const qs = QUESTIONS.filter((q) => !IDS || IDS.includes(q.id));
  const todo: [Question, number][] = [];
  for (let run = 1; run <= RUNS; run++) for (const q of qs) if (!seen.has(`${q.id}|${run}`)) todo.push([q, run]);

  console.log(`\n${condition}: ${todo.length} to do, ${seen.size} already done`);
  if (todo.length === 0) return;

  const needsModel = condition !== "platform-nomodel";
  if (needsModel && !hasGroqSaved()) {
    console.log("  skipped: GROQ_API_KEY is not set in .env.local");
    return;
  }
  if (condition === "platform-nomodel") modelsOff(); else modelsOn();

  for (const [q, run] of todo) {
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const out = condition.startsWith("platform")
          ? await askPlatform(q, condition)
          : await askBaseline(q, condition === "baseline-rules");
        if (out.rateLimited && attempt <= 6) {
          console.log(`  ${q.id} run ${run}: rate limited inside the platform, waiting 60s`);
          await sleep(60000);
          continue;
        }
        append(condition, { condition, id: q.id, run, profile: q.profile, question: q.question, at: new Date().toISOString(), ...out });
        console.log(`  ${q.id} run ${run}  ${String(out.latencyMs).padStart(6)}ms  ${out.text.replace(/\s+/g, " ").slice(0, 70)}`);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isRateLimit(msg) && attempt <= 6) {
          const ms = waitFor(msg);
          console.log(`  ${q.id} run ${run}: rate limited, waiting ${Math.round(ms / 1000)}s`);
          await sleep(ms);
          continue;
        }
        // Anything else is a real outcome (a timeout, a refusal) and is kept.
        append(condition, { condition, id: q.id, run, profile: q.profile, question: q.question, at: new Date().toISOString(), text: "", error: msg.slice(0, 300) });
        console.log(`  ${q.id} run ${run}  ERROR ${msg.slice(0, 80)}`);
        break;
      }
    }
    if (needsModel) await sleep(DELAY_MS);
  }
  modelsOn();
}

function hasGroqSaved(): boolean {
  modelsOn();
  return hasGroq();
}

async function main() {
  fs.mkdirSync(RESULTS, { recursive: true });
  const list = ONLY ?? [...CONDITIONS];
  for (const c of list) {
    if (!CONDITIONS.includes(c)) { console.log(`Unknown condition ${c}. Use one of ${CONDITIONS.join(", ")}`); continue; }
    await runCondition(c);
  }
  console.log("\nDone. Now run:  npm run eval:summary\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * Turn the stored answers into the tables the paper needs.
 *
 *   npm run eval:summary
 *
 * Writes eval/results/summary.md (read this) and eval/results/answers.csv
 * (every answer, one row each, for checking by hand).
 */
import fs from "node:fs";
import path from "node:path";
import { markPlatform, markBaseline, figureKey, strayFigures, type Question } from "./score";

const ROOT = path.resolve(__dirname);
const RESULTS = path.join(ROOT, "results");
const QUESTIONS: Question[] = JSON.parse(fs.readFileSync(path.join(ROOT, "questions.json"), "utf8")).questions;
const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
const CONDITIONS = ["platform-model", "platform-nomodel", "baseline-rules", "baseline-plain"];

interface Row {
  condition: string; id: string; run: number; text: string; latencyMs?: number; error?: string;
  guardOk?: boolean; degraded?: boolean; provider?: string; route?: { agent: string; usedModel: boolean };
  tools?: { tool: string; facts: Record<string, number | string> }[];
}

function load(condition: string): Row[] {
  const file = path.join(RESULTS, `${condition}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const pct = (a: number, b: number) => (b ? `${a}/${b}` : "-");

const md: string[] = [];
const csv: string[] = ["condition,id,run,expected,correct,read_as,latency_ms,guard_ok,fell_back,provider,error,answer"];
const perQuestion = new Map<string, Record<string, string>>();

md.push("# Evaluation summary", "", `Generated ${new Date().toISOString()}`, "");
md.push("## By condition", "");
md.push("| Condition | Answers | Correct | Questions right in every run | Same answer in every run | Median latency (ms) |");
md.push("|---|---|---|---|---|---|");

const notes: string[] = [];

for (const condition of CONDITIONS) {
  const rows = load(condition).filter((r) => BY_ID.has(r.id));
  if (!rows.length) { md.push(`| ${condition} | not run | | | | |`); continue; }
  const isBase = condition.startsWith("baseline");

  let correct = 0;
  const byQ = new Map<string, { marks: boolean[]; keys: string[] }>();
  for (const r of rows) {
    const q = BY_ID.get(r.id)!;
    const m = r.error ? { correct: false, readAs: "(error)" } : isBase ? markBaseline(q, r.text) : markPlatform(q, r.text, r.tools ?? []);
    if (m.correct) correct++;
    const e = byQ.get(r.id) ?? { marks: [], keys: [] };
    e.marks.push(m.correct);
    e.keys.push(r.error ? "(error)" : figureKey(q, r.text, condition, r.tools ?? []));
    byQ.set(r.id, e);
    csv.push([
      condition, r.id, r.run, q.expected ?? q.kind, m.correct ? 1 : 0, JSON.stringify(m.readAs),
      r.latencyMs ?? "", r.guardOk ?? "", r.degraded ?? "", r.provider ?? "", JSON.stringify(r.error ?? ""),
      JSON.stringify(r.text.replace(/\s+/g, " ")),
    ].join(","));
    const pq = perQuestion.get(r.id) ?? {};
    pq[condition] = pq[condition] ? pq[condition] : "";
    perQuestion.set(r.id, pq);
  }

  let allRight = 0, stable = 0;
  for (const [id, e] of byQ) {
    if (e.marks.every(Boolean)) allRight++;
    if (new Set(e.keys).size === 1) stable++;
    perQuestion.get(id)![condition] = `${e.marks.filter(Boolean).length}/${e.marks.length}`;
  }
  const lat = median(rows.filter((r) => !r.error && r.latencyMs !== undefined).map((r) => r.latencyMs as number));
  md.push(`| ${condition} | ${rows.length} | ${pct(correct, rows.length)} | ${pct(allRight, byQ.size)} | ${pct(stable, byQ.size)} | ${Number.isNaN(lat) ? "-" : lat} |`);

  const errors = rows.filter((r) => r.error).length;
  if (errors) notes.push(`- ${condition}: ${errors} answer(s) ended in an error or timeout, counted as wrong.`);
  if (isBase) {
    const finished = rows.filter((r) => !r.error && !markBaseline(BY_ID.get(r.id)!, r.text).noFinalLine);
    const empty = rows.filter((r) => !r.error && !r.text.trim()).length;
    const noLine = rows.length - finished.length - rows.filter((r) => r.error).length;
    const rightFinished = finished.filter((r) => markBaseline(BY_ID.get(r.id)!, r.text).correct).length;
    if (noLine) notes.push(`- ${condition}: ${noLine} answer(s) had no final ANSWER line (${empty} empty, the rest cut off mid-working), counted as wrong.`);
    notes.push(`- ${condition}: among the ${finished.length} answers that reached a final ANSWER line, ${rightFinished} were right.`);
  } else {
    const rejected = rows.filter((r) => r.guardOk === false).length;
    const fellBack = rows.filter((r) => r.degraded).length;
    const offRoute = rows.filter((r) => r.route && r.route.agent !== "computation").length;
    const modelRoute = rows.filter((r) => r.route?.usedModel).length;
    const stray = rows.filter((r) => strayFigures(r.text, r.tools ?? []).length > 0).length;
    notes.push(`- ${condition}: guard rejected the model's wording in ${rejected} of ${rows.length}; deterministic wording used in ${fellBack}; routed away from Computation in ${offRoute}; router consulted a model in ${modelRoute}.`);
    notes.push(`- ${condition}: replies containing a figure above 100 that no tool produced: ${stray} of ${rows.length}.`);
  }
}

md.push("", "## Notes", "", ...notes, "");

md.push("## By question (runs correct / runs)", "");
md.push(`| Question | Expected | ${CONDITIONS.join(" | ")} |`);
md.push(`|---|---|${CONDITIONS.map(() => "---").join("|")}|`);
for (const q of QUESTIONS) {
  const pq = perQuestion.get(q.id) ?? {};
  const exp = q.kind === "amount" ? (q.expected as number).toLocaleString("en-IN") : q.kind;
  md.push(`| ${q.id} | ${exp} | ${CONDITIONS.map((c) => pq[c] ?? "-").join(" | ")} |`);
}

md.push("", "## How answers were marked", "",
  "- Platform: the tool that answers the question must have produced the expected value, and the reply shown to the user must state it.",
  "- Baseline: only the final line 'ANSWER: <value>' is marked; a reply without one is wrong.",
  "- Same answer in every run: for the platform, the tool output that answers the question; for the baseline, its final ANSWER line. Identical across all three runs.",
  "- Every answer is in answers.csv. Check the wrong ones by hand before quoting any number.", "");

fs.writeFileSync(path.join(RESULTS, "summary.md"), md.join("\n"));
fs.writeFileSync(path.join(RESULTS, "answers.csv"), csv.join("\n"));
console.log(md.join("\n"));
console.log(`\nWritten: eval/results/summary.md and eval/results/answers.csv\n`);

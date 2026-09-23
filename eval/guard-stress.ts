/**
 * Stress test of the guard, with no model involved.
 *
 *   npm run eval:guard
 *
 * For every question in questions.json the tool that answers it is run on the
 * seed data, giving the real figures the guard would be checking against.
 * Replies are then constructed around those figures, some faithful and some
 * not, and each is passed through exactly what the platform does to a model's
 * reply: normalise the numbers, then check them.
 *
 * The replies are constructed, not produced by a model. The test measures
 * which kinds of error the guard catches and which faithful phrasings it
 * wrongly refuses. It says nothing about how often a model makes each error.
 *
 * Writes eval/results/guard-stress.md and eval/results/guard-stress.json.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { callTool } from "../lib/kernel/tools/execute";
import { checkReply, normaliseNumbers, inrGroup } from "../lib/kernel/guard";
import type { Question } from "./score";

const ROOT = path.resolve(__dirname);
const QUESTIONS: Question[] = JSON.parse(fs.readFileSync(path.join(ROOT, "questions.json"), "utf8")).questions;

/* ------------------------------------------------ numbers written as words */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} hundred` : "", r ? under100(r) : ""].filter(Boolean).join(" ");
}
/** Indian system: crore, lakh, thousand. */
function inWords(n: number): string {
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under100(lakh)} lakh`);
  if (thousand) parts.push(`${under100(thousand)} thousand`);
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

/* ------------------------------------------------------------ the cases */

type Expect = "pass" | "reject";
interface Case { cls: string; question: string; text: string; expect: Expect; }

const CLASSES: Record<string, { what: string; expect: Expect; group: string }> = {
  exact_indian:   { group: "Faithful", expect: "pass",   what: "Real figure, Indian digit grouping" },
  exact_western:  { group: "Faithful", expect: "pass",   what: "Real figure, Western digit grouping" },
  exact_plain:    { group: "Faithful", expect: "pass",   what: "Real figure, no grouping" },
  scaled_lakh:    { group: "Faithful", expect: "pass",   what: "Real figure written in lakh" },
  scaled_million: { group: "Faithful", expect: "pass",   what: "Real figure written in millions" },
  altered_digit:  { group: "Invented", expect: "reject", what: "One digit of a real figure changed" },
  off_by_one:     { group: "Invented", expect: "reject", what: "Real figure plus one rupee" },
  rounded:        { group: "Invented", expect: "reject", what: "Real figure rounded to the nearest thousand" },
  derived_sum:    { group: "Invented", expect: "reject", what: "Sum of two real figures" },
  derived_diff:   { group: "Invented", expect: "reject", what: "Difference of two real figures" },
  scaled_wrong:   { group: "Invented", expect: "reject", what: "Invented figure written in lakh" },
  other_profile:  { group: "Invented", expect: "reject", what: "A real figure from a different profile's answer" },
  words_wrong:    { group: "Invented", expect: "reject", what: "Invented figure written in words" },
  words_right:    { group: "Conservative", expect: "reject", what: "Real figure written in words (refused by design)" },
  small_rupees:   { group: "Blind spot", expect: "reject", what: "Invented rupee amount of 100 or less" },
  small_percent:  { group: "Blind spot", expect: "reject", what: "Invented percentage" },
};

const say = (fig: string) => `Based on your profile, the figure works out to ${fig} for this year.`;

async function main() {
  // Real facts for each question, from the kernel, on the seed data.
  const factsById = new Map<string, Record<string, number | string>>();
  for (const q of QUESTIONS) {
    const r = await callTool({ agent: "computation", tool: q.tool, args: q.args, ctx: { profileId: q.profile } });
    factsById.set(q.id, r.facts);
  }

  const cases: Case[] = [];
  for (const q of QUESTIONS) {
    const facts = factsById.get(q.id)!;
    const allowed = new Set(Object.values(facts).filter((v): v is number => typeof v === "number"));
    const real = [...allowed].filter((v) => v >= 1000);
    const notAllowed = (v: number) => !allowed.has(v) && v > 100;
    const add = (cls: string, text: string) => cases.push({ cls, question: q.id, text, expect: CLASSES[cls].expect });

    for (const v of real) {
      add("exact_indian", say(`₹${inrGroup(v)}`));
      if (v >= 100000) add("exact_western", say(`₹${v.toLocaleString("en-US")}`));
      add("exact_plain", say(`₹${v}`));
      if (v >= 100000 && v % 1000 === 0) add("scaled_lakh", say(`₹${v / 100000} lakh`));
      if (v >= 1000000 && v % 100000 === 0) add("scaled_million", say(`₹${v / 1000000} million`));

      const s = String(v);
      const i = s.length > 1 ? 1 : 0;
      const altered = Number(s.slice(0, i) + String((Number(s[i]) + 1) % 10) + s.slice(i + 1));
      if (notAllowed(altered)) add("altered_digit", say(`₹${inrGroup(altered)}`));
      if (notAllowed(v + 1)) add("off_by_one", say(`₹${inrGroup(v + 1)}`));
      const r = Math.round(v / 1000) * 1000;
      if (r !== v && notAllowed(r)) add("rounded", `That comes to about ₹${inrGroup(r)}.`);
      const lakhs = Math.floor(v / 100000) + 1;
      if (notAllowed(lakhs * 100000)) add("scaled_wrong", say(`₹${lakhs} lakh`));
      if (notAllowed(v + 1000)) add("words_wrong", say(`${inWords(v + 1000)} rupees`));
      add("words_right", say(`${inWords(v)} rupees`));
    }

    for (let a = 0; a < real.length; a++) for (let b = a + 1; b < real.length; b++) {
      const sum = real[a] + real[b], diff = Math.abs(real[a] - real[b]);
      if (notAllowed(sum)) add("derived_sum", say(`₹${inrGroup(sum)}`));
      if (notAllowed(diff)) add("derived_diff", say(`₹${inrGroup(diff)}`));
    }

    // A figure that is real, but belongs to someone else's answer.
    const other = QUESTIONS.find((o) => o.profile !== q.profile);
    const foreign = Object.values(factsById.get(other!.id)!).find((v) => typeof v === "number" && notAllowed(v as number));
    if (typeof foreign === "number") add("other_profile", say(`₹${inrGroup(foreign)}`));

    add("small_rupees", "You could also expect a fee of about ₹75 on this.");
    add("small_percent", "That is roughly 12 percent of your income.");
  }

  // Exactly what the platform does to a model's reply: normalise, then check.
  const results = cases.map((c) => {
    const facts = [factsById.get(c.question)!];
    const normalised = normaliseNumbers(c.text, facts);
    const g = checkReply(normalised, facts);
    return { ...c, rejected: !g.ok, offending: g.offending };
  });

  const md: string[] = [
    "# Guard stress test", "",
    `Generated ${new Date().toISOString()}. ${results.length} constructed replies over ${QUESTIONS.length} questions.`, "",
    "Replies are constructed around real tool outputs, not produced by a model. Each is normalised and checked exactly as a model's reply would be.", "",
    "| Group | Case | Should be | Replies | Rejected |",
    "|---|---|---|---|---|",
  ];
  for (const [cls, meta] of Object.entries(CLASSES)) {
    const rs = results.filter((r) => r.cls === cls);
    if (!rs.length) continue;
    md.push(`| ${meta.group} | ${meta.what} | ${meta.expect === "pass" ? "passed" : "rejected"} | ${rs.length} | ${rs.filter((r) => r.rejected).length} |`);
  }
  const faithful = results.filter((r) => r.expect === "pass");
  const invented = results.filter((r) => CLASSES[r.cls].group === "Invented");
  md.push("",
    `Faithful replies wrongly rejected: ${faithful.filter((r) => r.rejected).length} of ${faithful.length}.`,
    `Invented figures of more than 100 caught: ${invented.filter((r) => r.rejected).length} of ${invented.length}.`,
    "Blind spot: numbers of 100 or less are exempt by design, so that counts, percentages and section numbers in ordinary prose do not trip the guard.", "");

  const out = path.join(ROOT, "results");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "guard-stress.md"), md.join("\n"));
  fs.writeFileSync(path.join(out, "guard-stress.json"), JSON.stringify(results, null, 1));
  console.log(md.join("\n"));
  const surprises = results.filter((r) => (r.expect === "pass") === r.rejected && CLASSES[r.cls].group !== "Blind spot");
  if (surprises.length) {
    console.log("\nUnexpected outcomes (first 10):");
    for (const s of surprises.slice(0, 10)) console.log(`  ${s.question} ${s.cls}: ${s.text}  -> ${s.rejected ? "rejected " + s.offending.join(",") : "passed"}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

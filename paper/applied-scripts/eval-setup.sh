#!/usr/bin/env bash
# Adds the evaluation for the paper to the repository.
# Run from the repository root:   bash eval-setup.sh
set -euo pipefail

if [ ! -f package.json ] || ! grep -q '"name": "taxwise"' package.json; then
  echo "Run this from the taxwise folder (the one with package.json)."; exit 1
fi

mkdir -p eval/results

cat > eval/README.md <<'EVAL_FILE_0_END'
# Evaluation for the paper

This folder produces the results section of the paper. It asks the same 30
questions (10 per profile) four ways and records every answer:

| Condition | What answers |
|---|---|
| platform-model | The platform as built, with its language model |
| platform-nomodel | The same platform with every model key removed |
| baseline-rules | The same model with no tools, given the profile and the whole rulebook |
| baseline-plain | The same model with no tools, given the profile only |

Separately, a stress test feeds the guard about 1,700 constructed replies,
some faithful and some with invented figures, and counts what it catches.

Everything runs on the seed data. Nothing is written to Supabase.

## Step 1. Check the expected answers (do this first, by hand)

Open `eval/questions.json`. Every question has an `expected` answer and a
`working` line showing how it was worked out.

- Where `checkWith` says **official calculator**: open the Income Tax
  Department's "Income and Tax Calculator" for AY 2026-27 on
  incometax.gov.in, enter that profile's figures, and compare.
- Where it says **by hand**: read the `working` line and check the arithmetic
  and the rule it cites.

When a line agrees, write your name in `checkedBy` and how you checked it in
`checkedHow`. If a line disagrees, do not change it; tell Claude which one.

Only fill these in for lines you actually checked. The paper will say the
expected answers were checked independently, so this has to be true.

## Step 2. Run the guard stress test (seconds, no key needed)

    npm run eval:guard

## Step 3. Run the evaluation (long, about one to three hours)

Make sure `.env.local` has `GROQ_API_KEY`. Then:

    npm run eval

It prints one line per answer. The free Groq tier has per-minute and per-day
limits, so it will sometimes say "rate limited, waiting". That is normal.

If it is still waiting after a long time, press Ctrl+C and run `npm run eval`
again later, or put a teammate's Groq key in `.env.local` and run it again.
Nothing is lost: it skips every answer it already has.

## Step 4. Build the tables

    npm run eval:summary

This writes `eval/results/summary.md` (the tables) and
`eval/results/answers.csv` (every answer, one row each).

## Step 5. Hand it over

    git add eval
    git commit -m "Evaluation results"
    git push

Then tell Claude "pushed". Claude pulls the repository and reads
`eval/results/` directly, so there is nothing to paste.

## How answers are marked

- **Platform:** the tool that answers the question must have produced the
  expected value, and the reply shown to the user must state it.
- **Baseline:** the model is told to end with `ANSWER: <value>`. Only that
  line is marked, and a reply without it counts as wrong.
- **Same figures in every run:** each question is asked three times per
  condition. This column counts questions whose figures did not change.

The marking is automatic, so before any number goes into the paper, someone
reads the wrong answers in `answers.csv` to confirm they really are wrong.
EVAL_FILE_0_END
echo "  wrote eval/README.md"

cat > eval/questions.json <<'EVAL_FILE_1_END'
{
  "_readme": [
    "Thirty questions, ten per profile, each with one headline answer.",
    "expected is the correct answer worked out independently of the platform: income tax figures by hand from the FY 2025-26 rules and to be confirmed on the Income Tax Department's online calculator; GST, presumptive, TDS and advance tax figures by hand from the Act.",
    "Before running the evaluation, a team member checks each line, writes their name in checkedBy and how they checked it in checkedHow. Do not fill these in for a line you have not actually checked.",
    "kind is one of: amount (a rupee figure), zero (the answer is no tax), yes, no, unreachable (the target cannot be reached).",
    "tool and args say which kernel tool answers the question. They are used only by the guard stress test, never shown to the model.",
    "answerFacts names the tool output that holds the answer. The platform is marked right only if that output equals expected and the reply states it, so a reply that quotes the right number for the wrong reason is not counted."
  ],
  "questions": [
    {
      "id": "P01",
      "profile": "PRIYA-001",
      "question": "Which tax regime is better for me, and how much would I save by choosing it?",
      "kind": "amount",
      "expected": 87880,
      "working": "New regime tax 0, old regime tax 87,880, so the new regime saves 87,880.",
      "checkWith": "official calculator, both regimes",
      "tool": "compare_regimes",
      "args": {},
      "answerFacts": [
        "saving"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P02",
      "profile": "PRIYA-001",
      "question": "How much income tax will I pay under the new regime?",
      "kind": "zero",
      "expected": 0,
      "working": "Taxable 12,00,000 - 75,000 = 11,25,000. Slab tax 20,000 + 32,500 = 52,500. Taxable income is within 12,00,000 so the 87A rebate cancels all of it. Tax 0.",
      "checkWith": "official calculator, new regime",
      "tool": "compute_tax",
      "args": {
        "regime": "new"
      },
      "answerFacts": [
        "totalTax",
        "newRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P03",
      "profile": "PRIYA-001",
      "question": "What will my total tax be under the old regime?",
      "kind": "amount",
      "expected": 87880,
      "working": "Taxable 8,60,000. Slab tax 12,500 + 72,000 = 84,500. No 87A (above 5,00,000). Cess 4% = 3,380. Total 87,880.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "totalTax",
        "oldRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P04",
      "profile": "PRIYA-001",
      "question": "What is my taxable income under the old regime?",
      "kind": "amount",
      "expected": 860000,
      "working": "12,00,000 - 50,000 standard deduction - 2,40,000 HRA exemption - 50,000 under 80C = 8,60,000.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "taxableIncome",
        "oldRegimeTaxableIncome"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P05",
      "profile": "PRIYA-001",
      "question": "What is my taxable income under the new regime?",
      "kind": "amount",
      "expected": 1125000,
      "working": "12,00,000 - 75,000 standard deduction = 11,25,000.",
      "checkWith": "official calculator, new regime",
      "tool": "compute_tax",
      "args": {
        "regime": "new"
      },
      "answerFacts": [
        "taxableIncome",
        "newRegimeTaxableIncome"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P06",
      "profile": "PRIYA-001",
      "question": "How much of my house rent allowance is exempt from tax?",
      "kind": "amount",
      "expected": 240000,
      "working": "Least of: HRA received 3,00,000; 40% of basic 6,00,000 = 2,40,000 (Bengaluru, non-metro); rent 3,00,000 - 10% of basic 60,000 = 2,40,000. Exempt 2,40,000.",
      "checkWith": "by hand, section 10(13A) and rule 2A",
      "tool": "compute_hra_exemption",
      "args": {},
      "answerFacts": [
        "exemption"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P07",
      "profile": "PRIYA-001",
      "question": "How much cess will I pay under the old regime?",
      "kind": "amount",
      "expected": 3380,
      "working": "4% of 84,500 = 3,380.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "cess"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P08",
      "profile": "PRIYA-001",
      "question": "If my total 80C investment becomes Rs 1,50,000, what will my old-regime tax be?",
      "kind": "amount",
      "expected": 67080,
      "working": "Taxable 12,00,000 - 50,000 - 2,40,000 - 1,50,000 = 7,60,000. Slab tax 12,500 + 52,000 = 64,500. Cess 2,580. Total 67,080.",
      "checkWith": "official calculator, old regime with 80C 1,50,000",
      "tool": "what_if_deduction",
      "args": {
        "section": "80C",
        "amount": 150000
      },
      "answerFacts": [
        "taxAfter"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P09",
      "profile": "PRIYA-001",
      "question": "If I invest another Rs 50,000 under 80C, how much tax will I save under the old regime?",
      "kind": "amount",
      "expected": 10400,
      "working": "80C goes from 50,000 to 1,00,000. Taxable 8,10,000. Slab tax 12,500 + 62,000 = 74,500, cess 2,980, total 77,480. Saving 87,880 - 77,480 = 10,400.",
      "checkWith": "official calculator, old regime with 80C 1,00,000",
      "tool": "what_if_deduction",
      "args": {
        "section": "80C",
        "amount": 100000
      },
      "answerFacts": [
        "saving"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "P10",
      "profile": "PRIYA-001",
      "question": "How much do I need to invest under 80C for my old-regime tax to come down to Rs 40,000?",
      "kind": "unreachable",
      "expected": null,
      "working": "80C is capped at 1,50,000. At the cap the old-regime tax is 67,080 (see P08), which is above 40,000, so the target cannot be reached through 80C.",
      "checkWith": "follows from P08",
      "tool": "solve_backwards",
      "args": {
        "target": "totalTax",
        "targetValue": 40000,
        "lever": "d80C",
        "regime": "old"
      },
      "answerFacts": [
        "achievable"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A01",
      "profile": "ARJUN-002",
      "question": "Keeping regular books, which tax regime is better for me and by how much?",
      "kind": "amount",
      "expected": 124800,
      "working": "Profit from books 24,00,000 - 9,00,000 = 15,00,000. New regime 1,09,200, old regime 2,34,000. Difference 1,24,800.",
      "checkWith": "official calculator, both regimes, business income 15,00,000",
      "tool": "compare_regimes",
      "args": {},
      "answerFacts": [
        "saving"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A02",
      "profile": "ARJUN-002",
      "question": "Keeping regular books, what is my income tax under the new regime?",
      "kind": "amount",
      "expected": 109200,
      "working": "Taxable 15,00,000 (no standard deduction on business income). Slab tax 20,000 + 40,000 + 45,000 = 1,05,000. Cess 4,200. Total 1,09,200.",
      "checkWith": "official calculator, new regime",
      "tool": "compute_tax",
      "args": {
        "regime": "new"
      },
      "answerFacts": [
        "totalTax",
        "newRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A03",
      "profile": "ARJUN-002",
      "question": "Keeping regular books, what is my income tax under the old regime?",
      "kind": "amount",
      "expected": 234000,
      "working": "Taxable 15,00,000 - 1,00,000 (80C) - 25,000 (80D) = 13,75,000. Slab tax 12,500 + 1,00,000 + 1,12,500 = 2,25,000. Cess 9,000. Total 2,34,000.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "totalTax",
        "oldRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A04",
      "profile": "ARJUN-002",
      "question": "How much GST do I charge on my sales in a year?",
      "kind": "amount",
      "expected": 432000,
      "working": "18% of turnover 24,00,000 = 4,32,000.",
      "checkWith": "by hand, 18% rate for the service",
      "tool": "compute_gst",
      "args": {},
      "answerFacts": [
        "outputGST"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A05",
      "profile": "ARJUN-002",
      "question": "How much GST do I have to pay after input tax credit?",
      "kind": "amount",
      "expected": 340000,
      "working": "4,32,000 charged - 92,000 input credit = 3,40,000.",
      "checkWith": "by hand",
      "tool": "compute_gst",
      "args": {},
      "answerFacts": [
        "netGSTPayable"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A06",
      "profile": "ARJUN-002",
      "question": "Do I need to register for GST?",
      "kind": "yes",
      "expected": null,
      "working": "Aggregate turnover 24,00,000 is above the 20,00,000 threshold for services, so registration is compulsory.",
      "checkWith": "by hand, section 22 of the CGST Act",
      "tool": "compute_gst",
      "args": {},
      "answerFacts": [
        "registrationRequired"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A07",
      "profile": "ARJUN-002",
      "question": "Under section 44AD, how much profit would I declare?",
      "kind": "amount",
      "expected": 146400,
      "working": "6% on receipts through banking channels: 6% of 22,80,000 = 1,36,800. 8% on the rest: 8% of 1,20,000 = 9,600. Total 1,46,400.",
      "checkWith": "by hand, section 44AD(1)",
      "tool": "presumptive_vs_books",
      "args": {},
      "answerFacts": [
        "presumptiveProfit"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A08",
      "profile": "ARJUN-002",
      "question": "Keeping regular books and using the new regime, how much advance tax must I have paid in total by 15 September?",
      "kind": "amount",
      "expected": 49140,
      "working": "Liability 1,09,200. By 15 September, 45% cumulatively = 49,140.",
      "checkWith": "by hand, section 211",
      "tool": "compute_advance_tax",
      "args": {
        "underPresumptiveScheme": false
      },
      "answerFacts": [
        "due_15_Sep"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A09",
      "profile": "ARJUN-002",
      "question": "Keeping regular books, what is my taxable income under the old regime?",
      "kind": "amount",
      "expected": 1375000,
      "working": "15,00,000 - 1,00,000 - 25,000 = 13,75,000.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "taxableIncome",
        "oldRegimeTaxableIncome"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "A10",
      "profile": "ARJUN-002",
      "question": "If my total 80C investment becomes Rs 1,50,000, what will my old-regime tax be?",
      "kind": "amount",
      "expected": 218400,
      "working": "Taxable 15,00,000 - 1,50,000 - 25,000 = 13,25,000. Slab tax 12,500 + 1,00,000 + 97,500 = 2,10,000. Cess 8,400. Total 2,18,400.",
      "checkWith": "official calculator, old regime with 80C 1,50,000",
      "tool": "what_if_deduction",
      "args": {
        "section": "80C",
        "amount": 150000
      },
      "answerFacts": [
        "taxAfter"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R01",
      "profile": "ROHAN-003",
      "question": "Keeping regular books, which tax regime is better for me and by how much?",
      "kind": "amount",
      "expected": 129480,
      "working": "Profit from books 18,00,000 - 4,00,000 = 14,00,000. New regime 93,600, old regime 2,23,080. Difference 1,29,480.",
      "checkWith": "official calculator, both regimes, professional income 14,00,000",
      "tool": "compare_regimes",
      "args": {},
      "answerFacts": [
        "saving"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R02",
      "profile": "ROHAN-003",
      "question": "Keeping regular books, what is my income tax under the new regime?",
      "kind": "amount",
      "expected": 93600,
      "working": "Taxable 14,00,000. Slab tax 20,000 + 40,000 + 30,000 = 90,000. Cess 3,600. Total 93,600.",
      "checkWith": "official calculator, new regime",
      "tool": "compute_tax",
      "args": {
        "regime": "new"
      },
      "answerFacts": [
        "totalTax",
        "newRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R03",
      "profile": "ROHAN-003",
      "question": "Keeping regular books, what is my income tax under the old regime?",
      "kind": "amount",
      "expected": 223080,
      "working": "Taxable 14,00,000 - 60,000 = 13,40,000. Slab tax 12,500 + 1,00,000 + 1,02,000 = 2,14,500. Cess 8,580. Total 2,23,080.",
      "checkWith": "official calculator, old regime",
      "tool": "compute_tax",
      "args": {
        "regime": "old"
      },
      "answerFacts": [
        "totalTax",
        "oldRegimeTax"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R04",
      "profile": "ROHAN-003",
      "question": "How far am I from the GST registration threshold?",
      "kind": "amount",
      "expected": 200000,
      "working": "Aggregate turnover includes export receipts: 18,00,000. Threshold 20,00,000. Headroom 2,00,000.",
      "checkWith": "by hand, section 2(6) and section 22 of the CGST Act",
      "tool": "compute_gst",
      "args": {},
      "answerFacts": [
        "headroomToThreshold"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R05",
      "profile": "ROHAN-003",
      "question": "Do I need to register for GST right now?",
      "kind": "no",
      "expected": null,
      "working": "Aggregate turnover 18,00,000 is below the 20,00,000 threshold.",
      "checkWith": "by hand, section 22 of the CGST Act",
      "tool": "compute_gst",
      "args": {},
      "answerFacts": [
        "registrationRequired"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R06",
      "profile": "ROHAN-003",
      "question": "Under section 44ADA, how much profit would I declare?",
      "kind": "amount",
      "expected": 900000,
      "working": "50% of gross receipts 18,00,000 = 9,00,000.",
      "checkWith": "by hand, section 44ADA(1)",
      "tool": "presumptive_vs_books",
      "args": {},
      "answerFacts": [
        "presumptiveProfit"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R07",
      "profile": "ROHAN-003",
      "question": "How much TDS should my clients have deducted under section 194J?",
      "kind": "amount",
      "expected": 80000,
      "working": "Only Indian clients deduct TDS under 194J. 10% of 8,00,000 domestic receipts = 80,000. Overseas clients (10,00,000) deduct none.",
      "checkWith": "by hand, section 194J",
      "tool": "compute_194j_tds",
      "args": {},
      "answerFacts": [
        "expectedTDS"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R08",
      "profile": "ROHAN-003",
      "question": "Keeping regular books and using the new regime, how much advance tax must I have paid in total by 15 December?",
      "kind": "amount",
      "expected": 70200,
      "working": "Liability 93,600. By 15 December, 75% cumulatively = 70,200.",
      "checkWith": "by hand, section 211",
      "tool": "compute_advance_tax",
      "args": {
        "underPresumptiveScheme": false
      },
      "answerFacts": [
        "due_15_Dec"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R09",
      "profile": "ROHAN-003",
      "question": "If my total 80C investment becomes Rs 1,50,000, what will my old-regime tax be?",
      "kind": "amount",
      "expected": 195000,
      "working": "Taxable 14,00,000 - 1,50,000 = 12,50,000. Slab tax 12,500 + 1,00,000 + 75,000 = 1,87,500. Cess 7,500. Total 1,95,000.",
      "checkWith": "official calculator, old regime with 80C 1,50,000",
      "tool": "what_if_deduction",
      "args": {
        "section": "80C",
        "amount": 150000
      },
      "answerFacts": [
        "taxAfter"
      ],
      "checkedBy": "",
      "checkedHow": ""
    },
    {
      "id": "R10",
      "profile": "ROHAN-003",
      "question": "If I invest another Rs 40,000 under 80C, how much tax would I save under the old regime?",
      "kind": "amount",
      "expected": 12480,
      "working": "80C goes from 60,000 to 1,00,000. Taxable 13,00,000. Slab tax 12,500 + 1,00,000 + 90,000 = 2,02,500, cess 8,100, total 2,10,600. Saving 2,23,080 - 2,10,600 = 12,480.",
      "checkWith": "official calculator, old regime with 80C 1,00,000",
      "tool": "what_if_deduction",
      "args": {
        "section": "80C",
        "amount": 100000
      },
      "answerFacts": [
        "saving"
      ],
      "checkedBy": "",
      "checkedHow": ""
    }
  ]
}
EVAL_FILE_1_END
echo "  wrote eval/questions.json"

cat > eval/_env.ts <<'EVAL_FILE_2_END'
/**
 * Imported before anything else. The evaluation runs on the seed data, so
 * every run starts from the same state and nothing is written to Supabase.
 * Setting the variable to empty here means .env.local cannot switch it back.
 */
process.env.DATABASE_URL = "";
EVAL_FILE_2_END
echo "  wrote eval/_env.ts"

cat > eval/score.ts <<'EVAL_FILE_3_END'
/**
 * How an answer is marked right or wrong.
 *
 * Scoring happens when the summary is built, not when the question is asked.
 * That way a scoring rule can be corrected and every stored answer re-marked
 * without spending another model call.
 *
 * The platform and the baseline are marked slightly differently, on purpose:
 *
 *   platform   the user-facing reply must state the expected figure (or the
 *              expected verdict). The guard already guarantees any figure it
 *              states came from a tool, so the question is whether it answered
 *              what was asked.
 *
 *   baseline   the model is told to finish with a line "ANSWER: <value>". Only
 *              that line is marked. This stops a reply that mentions the right
 *              figure in passing, then concludes something else, from being
 *              counted as correct.
 */

export type Kind = "amount" | "zero" | "yes" | "no" | "unreachable";

export interface Question {
  id: string;
  profile: string;
  question: string;
  kind: Kind;
  expected: number | null;
  tool: string;
  args: Record<string, unknown>;
  /** Which tool outputs hold the answer. */
  answerFacts: string[];
}

export type ToolOut = { tool: string; facts: Record<string, number | string> }[];

const SCALE: Record<string, number> = {
  crore: 1e7, crores: 1e7,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  million: 1e6, millions: 1e6,
  thousand: 1e3, thousands: 1e3, k: 1e3,
};

/** Every rupee-like number in a piece of text, with scale words resolved. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(crores?|lakhs?|lacs?|millions?|thousands?|k)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const mult = m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1;
    out.push(Math.round(base * mult));
  }
  return out;
}

/** Does the text say the tax is nothing? */
export function saysZero(text: string): boolean {
  return (
    /(?:₹|rs\.?|inr)\s?0(?![\d,.])/i.test(text) ||
    /\b(?:is|of|be|pay|owe|payable|comes? to|:)\s*(?:₹|rs\.?\s?)?0(?![\d,.])/i.test(text) ||
    /\b(zero|nil|nothing)\b/i.test(text) ||
    /\bno (?:income )?tax\b/i.test(text) ||
    /\b(?:not|won'?t|will not|don'?t|do not)\b[^.]{0,20}\bpay any\b/i.test(text)
  );
}

/** Read a yes or no out of the text. Negation is checked first. */
export function yesNo(text: string): "yes" | "no" | "unclear" {
  const t = text.toLowerCase();
  const negated =
    /\b(not|no longer|isn'?t|aren'?t|don'?t|do not|doesn'?t|does not|no need|not yet)\b[^.]{0,40}\b(required|mandatory|compulsory|need|have to|must|obliged)\b/.test(t) ||
    /\b(below|under|within) the (?:gst )?(?:registration )?threshold\b/.test(t) ||
    /\bbefore registration becomes (?:compulsory|mandatory|required)\b/.test(t) ||
    /^\s*no\b/.test(t);
  if (negated) return "no";
  if (/\b(yes|required|must register|need to register|have to register|mandatory|compulsory|obliged)\b/.test(t)) return "yes";
  if (/\b(above|over|exceeds?|crossed) the (?:gst )?(?:registration )?threshold\b/.test(t)) return "yes";
  return "unclear";
}

/** Does the text say the target cannot be reached? */
export function saysUnreachable(text: string): boolean {
  return /\b(cannot|can'?t|can not|not possible|unreachable|not reachable|not achievable|impossible|won'?t (?:be able to )?(?:reach|get)|will not (?:reach|get)|no amount of|not enough)\b/i.test(text);
}

/** The value on the baseline's final "ANSWER:" line, or null if there is none. */
export function finalAnswerLine(text: string): string | null {
  const re = /^[ \t>*_#-]*answer[ \t*_]*[:：][ \t]*(.+)$/gim;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) last = m[1].replace(/[*_`]/g, "").trim();
  return last;
}

export interface Mark {
  correct: boolean;
  /** What the answer was read as, for the per-answer table. */
  readAs: string;
  /** Baseline only: the model did not give a final ANSWER line. */
  noFinalLine?: boolean;
}

function markText(q: Question, text: string): Mark {
  switch (q.kind) {
    case "amount": {
      const nums = numbersIn(text);
      return { correct: nums.includes(q.expected as number), readAs: [...new Set(nums)].join(" ") };
    }
    case "zero": {
      const z = saysZero(text);
      return { correct: z, readAs: z ? "zero" : [...new Set(numbersIn(text))].join(" ") };
    }
    case "yes":
    case "no": {
      const v = yesNo(text);
      return { correct: v === q.kind, readAs: v };
    }
    case "unreachable": {
      const u = saysUnreachable(text);
      return { correct: u, readAs: u ? "unreachable" : [...new Set(numbersIn(text))].join(" ") };
    }
  }
}

/**
 * The platform is right when the tool that answers the question produced the
 * expected value AND the reply says it. The first half matters: a reply can
 * quote a genuine figure that happens to equal the expected one (the amount
 * actually deducted, say) while computing the thing asked about wrongly.
 */
export function markPlatform(q: Question, text: string, tools: ToolOut = []): Mark {
  const byText = markText(q, text);
  const holding = tools.flatMap((t) => q.answerFacts.filter((k) => k in t.facts).map((k) => t.facts[k]));
  if (holding.length === 0) return byText;
  const want: number | string =
    q.kind === "amount" || q.kind === "zero" ? (q.expected as number)
    : q.kind === "unreachable" ? "no"
    : q.kind;
  const computedRight = holding.some((v) => v === want);
  if (byText.correct && !computedRight) {
    return { correct: false, readAs: `${byText.readAs} (tool gave ${holding.join(" ")})` };
  }
  return byText;
}

export function markBaseline(q: Question, text: string): Mark {
  const line = finalAnswerLine(text);
  if (line === null) return { correct: false, readAs: "(no ANSWER line)", noFinalLine: true };
  if (q.kind === "amount") {
    // The first figure on the answer line is the answer.
    const n = numbersIn(line)[0];
    return { correct: n === q.expected, readAs: n === undefined ? line.slice(0, 40) : String(n) };
  }
  return markText(q, line);
}

/** For reproducibility: the figures an answer committed to, as a comparable key. */
export function figureKey(q: Question, text: string, condition: string): string {
  if (condition.startsWith("baseline")) {
    const line = finalAnswerLine(text);
    if (line === null) return "(none)";
    if (q.kind === "amount") return String(numbersIn(line)[0] ?? line.toLowerCase());
    return markText(q, line).readAs;
  }
  // The platform's wording varies between runs by design; its figures must not.
  return [...new Set(numbersIn(text))].sort((a, b) => a - b).join(" ");
}
EVAL_FILE_3_END
echo "  wrote eval/score.ts"

cat > eval/run-eval.ts <<'EVAL_FILE_4_END'
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
EVAL_FILE_4_END
echo "  wrote eval/run-eval.ts"

cat > eval/summarise.ts <<'EVAL_FILE_5_END'
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
import { markPlatform, markBaseline, figureKey, type Question } from "./score";

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
md.push("| Condition | Answers | Correct | Questions right in every run | Same figures in every run | Median latency (ms) |");
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
    e.keys.push(r.error ? "(error)" : figureKey(q, r.text, condition));
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
    const noLine = rows.filter((r) => !r.error && markBaseline(BY_ID.get(r.id)!, r.text).noFinalLine).length;
    if (noLine) notes.push(`- ${condition}: ${noLine} answer(s) had no final ANSWER line, counted as wrong.`);
  } else {
    const rejected = rows.filter((r) => r.guardOk === false).length;
    const fellBack = rows.filter((r) => r.degraded).length;
    const offRoute = rows.filter((r) => r.route && r.route.agent !== "computation").length;
    const modelRoute = rows.filter((r) => r.route?.usedModel).length;
    notes.push(`- ${condition}: guard rejected the model's wording in ${rejected} of ${rows.length}; deterministic wording used in ${fellBack}; routed away from Computation in ${offRoute}; router consulted a model in ${modelRoute}.`);
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
  "- Same figures in every run: the platform's set of figures, or the baseline's final answer, is identical across runs.",
  "- Every answer is in answers.csv. Check the wrong ones by hand before quoting any number.", "");

fs.writeFileSync(path.join(RESULTS, "summary.md"), md.join("\n"));
fs.writeFileSync(path.join(RESULTS, "answers.csv"), csv.join("\n"));
console.log(md.join("\n"));
console.log(`\nWritten: eval/results/summary.md and eval/results/answers.csv\n`);
EVAL_FILE_5_END
echo "  wrote eval/summarise.ts"

cat > eval/guard-stress.ts <<'EVAL_FILE_6_END'
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
EVAL_FILE_6_END
echo "  wrote eval/guard-stress.ts"

node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.scripts["eval"] = "tsx eval/run-eval.ts";
p.scripts["eval:guard"] = "tsx eval/guard-stress.ts";
p.scripts["eval:summary"] = "tsx eval/summarise.ts";
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
'
echo "  added npm run eval, eval:guard, eval:summary"
echo ""
echo "Next: read eval/README.md, check the expected answers, then:"
echo "  npm run eval:guard"
echo "  npm run eval"
echo "  npm run eval:summary"

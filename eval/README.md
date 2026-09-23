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

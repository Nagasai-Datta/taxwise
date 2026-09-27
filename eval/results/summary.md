# Evaluation summary

Generated 2026-09-27T19:20:22.133Z

## By condition

| Condition | Answers | Correct | Questions right in every run | Same figures in every run | Median latency (ms) |
|---|---|---|---|---|---|
| platform-model | 75 | 60/75 | 21/30 | 11/30 | 13105 |
| platform-nomodel | 90 | 54/90 | 18/30 | 30/30 | 0 |
| baseline-rules | 90 | 50/90 | 14/30 | 19/30 | 24512 |
| baseline-plain | 90 | 23/90 | 4/30 | 6/30 | 2976 |

## Notes

- platform-model: guard rejected the model's wording in 7 of 75; deterministic wording used in 9; routed away from Computation in 0; router consulted a model in 0.
- platform-nomodel: guard rejected the model's wording in 0 of 90; deterministic wording used in 90; routed away from Computation in 0; router consulted a model in 0.
- baseline-rules: 15 answer(s) had no final ANSWER line, counted as wrong.
- baseline-plain: 8 answer(s) ended in an error or timeout, counted as wrong.
- baseline-plain: 27 answer(s) had no final ANSWER line, counted as wrong.

## By question (runs correct / runs)

| Question | Expected | platform-model | platform-nomodel | baseline-rules | baseline-plain |
|---|---|---|---|---|---|
| P01 | 87,880 | 3/3 | 3/3 | 1/3 | 0/3 |
| P02 | zero | 2/3 | 3/3 | 0/3 | 0/3 |
| P03 | 87,880 | 3/3 | 3/3 | 3/3 | 0/3 |
| P04 | 8,60,000 | 3/3 | 0/3 | 3/3 | 2/3 |
| P05 | 11,25,000 | 3/3 | 0/3 | 3/3 | 0/3 |
| P06 | 2,40,000 | 3/3 | 3/3 | 3/3 | 3/3 |
| P07 | 3,380 | 3/3 | 0/3 | 3/3 | 0/3 |
| P08 | 67,080 | 1/3 | 0/3 | 3/3 | 2/3 |
| P09 | 10,400 | 0/3 | 0/3 | 3/3 | 2/3 |
| P10 | unreachable | 3/3 | 0/3 | 1/3 | 0/3 |
| A01 | 1,24,800 | 3/3 | 3/3 | 0/3 | 0/3 |
| A02 | 1,09,200 | 3/3 | 3/3 | 0/3 | 0/3 |
| A03 | 2,34,000 | 3/3 | 3/3 | 0/3 | 0/3 |
| A04 | 4,32,000 | 3/3 | 3/3 | 3/3 | 3/3 |
| A05 | 3,40,000 | 3/3 | 3/3 | 3/3 | 3/3 |
| A06 | yes | 0/2 | 3/3 | 3/3 | 3/3 |
| A07 | 1,46,400 | 2/2 | 3/3 | 3/3 | 0/3 |
| A08 | 49,140 | 2/2 | 0/3 | 0/3 | 0/3 |
| A09 | 13,75,000 | 2/2 | 0/3 | 0/3 | 0/3 |
| A10 | 2,18,400 | 1/2 | 0/3 | 0/3 | 0/3 |
| R01 | 1,29,480 | 2/2 | 3/3 | 1/3 | 0/3 |
| R02 | 93,600 | 2/2 | 3/3 | 1/3 | 0/3 |
| R03 | 2,23,080 | 2/2 | 3/3 | 0/3 | 0/3 |
| R04 | 2,00,000 | 1/2 | 3/3 | 3/3 | 1/3 |
| R05 | no | 0/2 | 3/3 | 3/3 | 2/3 |
| R06 | 9,00,000 | 2/2 | 3/3 | 3/3 | 1/3 |
| R07 | 80,000 | 2/2 | 3/3 | 0/3 | 1/3 |
| R08 | 70,200 | 2/2 | 0/3 | 2/3 | 0/3 |
| R09 | 1,95,000 | 1/2 | 0/3 | 0/3 | 0/3 |
| R10 | 12,480 | 0/2 | 0/3 | 2/3 | 0/3 |

## How answers were marked

- Platform: the tool that answers the question must have produced the expected value, and the reply shown to the user must state it.
- Baseline: only the final line 'ANSWER: <value>' is marked; a reply without one is wrong.
- Same figures in every run: the platform's set of figures, or the baseline's final answer, is identical across runs.
- Every answer is in answers.csv. Check the wrong ones by hand before quoting any number.

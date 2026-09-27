# Guard stress test

Generated 2026-09-27T17:09:10.725Z. 1707 constructed replies over 30 questions.

Replies are constructed around real tool outputs, not produced by a model. Each is normalised and checked exactly as a model's reply would be.

| Group | Case | Should be | Replies | Rejected |
|---|---|---|---|---|
| Faithful | Real figure, Indian digit grouping | passed | 137 | 0 |
| Faithful | Real figure, Western digit grouping | passed | 83 | 0 |
| Faithful | Real figure, no grouping | passed | 137 | 0 |
| Faithful | Real figure written in lakh | passed | 69 | 0 |
| Faithful | Real figure written in millions | passed | 22 | 0 |
| Invented | One digit of a real figure changed | rejected | 137 | 137 |
| Invented | Real figure plus one rupee | rejected | 137 | 137 |
| Invented | Real figure rounded to the nearest thousand | rejected | 49 | 49 |
| Invented | Sum of two real figures | rejected | 238 | 238 |
| Invented | Difference of two real figures | rejected | 210 | 210 |
| Invented | Invented figure written in lakh | rejected | 124 | 124 |
| Invented | A real figure from a different profile's answer | rejected | 30 | 30 |
| Invented | Invented figure written in words | rejected | 137 | 137 |
| Conservative | Real figure written in words (refused by design) | rejected | 137 | 137 |
| Blind spot | Invented rupee amount of 100 or less | rejected | 30 | 0 |
| Blind spot | Invented percentage | rejected | 30 | 0 |

Faithful replies wrongly rejected: 0 of 448.
Invented figures of more than 100 caught: 1062 of 1062.
Blind spot: numbers of 100 or less are exempt by design, so that counts, percentages and section numbers in ordinary prose do not trip the guard.

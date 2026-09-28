# PAPER_STATE

Last updated: 28 September 2026 (evaluation complete, documents organised), by Nagasai (with Claude)

## Venue
13th International Conference on Business Analytics and Intelligence (BAICONF 2026), Data Centre and Analytics Lab, IIM Bangalore, 17 to 19 December 2026. Abstract selected (submitted under Dr. Kalaavathi B, ID BAI2332). ICADCML 2027 (Springer) was dropped: the same paper cannot go to two venues.
- Full paper due 31 October 2026, uploaded on the conference site. At most 4,500 words (assume references count until confirmed).
- Required structure: introduction, literature review, methodology, findings, conclusion and implications, references. No template given.
- Data set preferred as an Excel file.
- Registration by 14 November 2026; student fee INR 5,000.
- Proceedings go to delegates; IIMB Management Review is listed under publications (route not stated).
- Blind review not stated. Author order (proposed): Nagasai, Tanishq, Devesh, Dr. Kalaavathi B.

## Where everything is
- Repository: github.com/Nagasai-Datta/taxwise. Paper documents in `paper/`; evaluation in `eval/` and `eval/results/`; master plan also as `docs/MASTER_PLAN.md`.
- The same documents are in the Claude project files.
- Scripts Claude sends are downloaded to ~/Downloads; the repository is at ~/Desktop/taxwise. Every script comes with its terminal commands.

## Status by section
| Section | Status | Notes |
|---|---|---|
| Abstract | accepted version kept | Only change: drop the unsupported NCFE "tax is weakest" clause, add the findings (guide to approve). Confirm paper/Abstract.pdf is the exact submitted text. |
| 1 Introduction | not started | |
| 2 Literature review | notes ready | paper/Literature_Notes.docx: five strands and the sentences to use |
| 3 Methodology | not started | System design, the five enforcement points, evaluation design (master plan 5 to 8, 15.3) |
| 4 Findings | results complete | Master plan 15.3 has the tables and the breakdown of wrong answers |
| 5 Conclusion and implications | not started | Implications for fintech builders, educators, regulators; limitations; future work |
| References | source table done | About 25 to 30 in the final paper |
| Data set (Excel) | not started | Questions, answer key, every answer, guard test |
| Figures | not started | Architecture, question flow |

## Evaluation (final, 28 September)
30 questions (10 per profile), four conditions, three runs each, seed data, 60 s per model call. Answer key worked by hand, checked by Nagasai, cross-checked with a second LLM.

| Condition | Right, of 90 | Right in all 3 runs | Same answer in all 3 runs | Figures no tool produced |
|---|---|---|---|---|
| Platform with model | 69 | 20/30 | 24/30 | 0/90 |
| Platform without model | 54 | 18/30 | 30/30 | 0/90 |
| Baseline with rulebook | 53 | 15/30 | 19/30 | n/a |
| Baseline with profile only | 23 | 4/30 | 6/30 | n/a |

- By profile (platform vs baseline with rulebook): Priya 25 vs 26, Arjun 23 vs 12, Rohan 21 vs 15.
- Platform's 21 wrong: 6 argument misreads ("another" amount passed as the total), 15 wrong or missing tool; one false statement with no figure (guard does not check prose).
- Baseline's wrong answers that reached a final line were all wrong figures or verdicts (22 of 75 with rulebook).
- Guard stress test: 0 of 448 faithful replies rejected; 1,062 of 1,062 invented figures above 100 caught; numbers of 100 or less exempt by design.
- Two marking faults in eval/score.ts were fixed on 28 September (a zero at the end of a sentence; a bare "0" on the baseline's answer line). The numbers above are after the fix.

## Decisions made
- Keep the registered title. Venue: BAICONF only.
- Outline follows BAICONF's required structure.
- Evaluation against the same model without tools, with and without the rulebook; answer key worked independently of the platform.
- 194J and 44AD corrected (fix-rules.sh); tests 318 of 318.
- Claims follow master plan section 17 (updated 28 September).
- Keep a one-line acknowledgement of AI assistance in writing.

## Open questions for the team
- Guide: approve correcting the NCFE sentence in the abstract; withdraw from other conferences if another accepts this paper.
- Confirm paper/Abstract.pdf is the submitted text.
- Whether a graphic designer qualifies as a specified profession for 44ADA (affects Rohan's fixture; the paper can state it as an assumption).
- Optional: DOIs for refs 12, 24 and S4 ("Cite This" on the publisher page).

## Source table
paper/Source_Table.docx. Old 29: 22 verified, 2 corrected, 3 dropped, 2 replaced; plus 4 stand-ins and 15 new. Claims to avoid: "first", "portals only compute", "tax knowledge is weakest", "material errors on Indian tax". Rules are FY 2025-26 under the 1961 Act; the Income Tax Act, 2025 took effect 1 April 2026.

## Next step
Nagasai shows everything to Dr. Kalaavathi B. On go-ahead, Claude writes the full BAICONF paper (.docx) and the Excel data set.

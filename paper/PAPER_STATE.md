# PAPER_STATE

Last updated: 8 October 2026 (full first draft written), by Nagasai (with Claude)

## Venue
13th International Conference on Business Analytics and Intelligence (BAICONF 2026), Data Centre and Analytics Lab, IIM Bangalore, 17 to 19 December 2026. Abstract selected (submitted under Dr. Kalaavathi B, ID BAI2332). ICADCML 2027 (Springer) was dropped: the same paper cannot go to two venues.
- Full paper due 31 October 2026, uploaded on the conference site. At most 4,500 words, **references included** (confirmed).
- Format: the IEEE A4 conference template BAICONF supplied (Full-Paper-Template.docx in the project files). The abstract template allows at most 500 words and 5 keywords.
- Required structure: introduction, literature review, methodology, findings, conclusion and implications, references.
- Data set preferred as an Excel file.
- Registration by 14 November 2026; student fee INR 5,000.
- Author order: M Naga Sai Dattu, Tanishq Daga, Devesh Atul Mahajan, Kalaavathi B.

## Where everything is
- Repository: github.com/Nagasai-Datta/taxwise. Paper documents in `paper/`; evaluation in `eval/` and `eval/results/`.
- The same documents are in the Claude project files.
- Scripts Claude sends are downloaded to ~/Downloads; the repository is at ~/Desktop/taxwise. Every script comes with its terminal commands.
- **Do not put the GitHub link anywhere in the paper.** The guide will send it with the additional formalities.

## Status by section
| Section | Status | Notes |
|---|---|---|
| Title | done | Accepted title, with "Using" capitalised as the template's own rule asks |
| Authors | names only | Affiliation, city and email left as template placeholders for the guide to fill |
| Abstract | drafted, needs guide's approval | Changed parts highlighted in yellow: NCFE sentence corrected; "material errors" replaced; "reproducible irrespective of the model" narrowed; findings added. About 330 words |
| I Introduction | drafted | |
| II Literature review | drafted | Four strands from Literature_Notes.docx |
| III Methodology | drafted | Rule, architecture (Fig. 1), five enforcement points (Table I, Fig. 2), implementation, evaluation design |
| IV Findings | drafted | Table II; error types; guard on real model output; stress test; what the checks miss |
| V Conclusion and implications | drafted | Builders, educators, regulators; limitations; future work |
| References | done | 26, IEEE style, all from Source_Table.docx. Added chain of thought (3), Ramjattan et al. (5), Guo et al. (S4) and the hallucination survey (N8); the other 17 usable sources are left out because no sentence needs them and references count toward the limit |
| Data set (Excel) | not started | Questions, answer key, all 360 answers, guard test |
| Word count | 4,440 | Everything included (title, author placeholders, abstract, tables, captions, references). Real affiliations may shift it slightly |

## Draft file
`BAICONF_2026_Full_Paper_Draft.docx`. Built to the template's IEEE A4 specification (page, margins, two columns, style names, sizes, heading and reference numbering) because the project copy of Full-Paper-Template.docx is text only. **Next session: attach the original template .docx in the chat and move the content into that exact file.**

## Evaluation (final, 28 September)
30 questions (10 per profile), four conditions, three runs each, seed data, 60 s per model call. Answer key worked by hand, checked by Nagasai (18 against the official calculator, 12 by hand), cross-checked with a second LLM.

| Condition | Right, of 90 | Right in all 3 runs | Same answer in all 3 runs | Figures no tool produced |
|---|---|---|---|---|
| Platform with model | 69 | 20/30 | 24/30 | 0/90 |
| Platform without model | 54 | 18/30 | 30/30 | 0/90 |
| Baseline with rulebook | 53 | 15/30 | 19/30 | n/a |
| Baseline with profile only | 23 | 4/30 | 6/30 | n/a |

- By profile (Priya, Arjun, Rohan): platform with model 25, 23, 21; without model 12, 21, 21; baseline with rulebook 26, 12, 15; profile only 9, 9, 5.
- Platform's 21 wrong: 6 argument misreads ("another" amount passed as the total, P09 and R10), 15 wrong or missing tool; one false statement with no figure (A08).
- Guard on real model output (from eval/results/platform-model.jsonl, now in the paper): rejected 10 of 90. Five were GST thresholds the model wrote from its own knowledge (A06, R05); five were figures written in words.
- Baseline's wrong answers that reached a final line were all wrong figures or verdicts (22 of 75 with rulebook, 32 of 55 profile only).
- Guard stress test: 0 of 448 faithful replies rejected; 1,062 of 1,062 invented figures above 100 caught; numbers of 100 or less exempt by design.

## Decisions made
- Keep the registered title. Venue: BAICONF only.
- No repository link anywhere in the paper.
- Evaluation against the same model without tools, with and without the rulebook; answer key worked independently of the platform.
- Claims follow master plan section 17.
- Rohan's 44ADA eligibility is stated in the paper as an assumption of the test profile.
- The 318 tests are not mentioned (words are scarce and the audience is business analytics).
- The template's own "Abstract—" and "Keywords—" labels keep its dash; there are no dashes in the prose.
- One-line acknowledgement of AI assistance in writing.

## Open questions for the team
- Guide: approve the four highlighted abstract changes (two go beyond the NCFE fix because the original wording conflicts with master plan section 17).
- Guide: fill affiliations, emails and designation in the author block.
- Rulebook per-section notes still say NOT YET VERIFIED; fix before submission.

## Next step
Attach the original Full-Paper-Template.docx; Claude moves the draft into it. Then the Excel data set. Guide reviews the draft (target 20 October).

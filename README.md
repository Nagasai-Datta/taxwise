# TaxWise

A Conversational Platform for Financial Literacy and Management using a
Multi-Agent LLM Orchestrator.

BCSE497J Project-I. Naga Sai Dattu (23BCE0757), Tanishq Daga (23BCE2119),
Devesh Atul Mahajan (23BCE0801). Guide: Dr. Kalaavathi B.

## Where this build stands

**Phase 1 is complete.** The kernel computes tax, GST, presumptive taxation
and advance tax for all three profiles, with a full trace on every figure.
No language model, no database, no network. Layers 1, 2, 3 and 5 are empty.

```bash
npm install
npm test        # 45 kernel assertions
npm run verify  # every profile's full computation, for hand checking
npm run dev     # http://localhost:3000
```

## Before anything else: verify the rulebook

`data/tax_rules.json` was transcribed from published FY 2025-26 rate tables
and **has not been checked by a human**. Every figure in this project rests
on that one file.

```bash
npm run checklist
```

That prints every figure with a blank to tick. Check each against
incometaxindia.gov.in and the calculator on incometax.gov.in, then fill in
`_meta.verification` with your name and the date.

## What the kernel does

| Family | Functions |
|---|---|
| Tax | computeSlabTax, computeHRAExemption, applyDeductionCaps, computeTax, compareRegimes, optimizeDeductions |
| Business | computeGST, presumptiveVsBooks, computeAdvanceTax, compute194J |
| Calendar | getApplicableDeadlines |

Two decisions worth knowing:

**optimizeDeductions re-runs the whole tax engine** with a section filled to
its cap, rather than multiplying headroom by an assumed marginal rate. The
naive method is wrong near a slab boundary and badly wrong near the 87A
threshold, where tax drops to zero in one step.

**Every function emits a trace as it computes.** The trace tree is not
reconstructed afterwards; it is a byproduct of the arithmetic, which is what
makes it trustworthy.

## Known gaps

Listed in `_gaps` inside the rulebook. Surcharge above 50 lakh, marginal
relief, senior citizen slabs and capital gains are not implemented. No test
fixture reaches any of those cases.

## Next

Phase 2: Supabase schema and seeding. Needs a Supabase project.

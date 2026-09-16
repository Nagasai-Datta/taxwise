#!/usr/bin/env bash
#  TaxWise - PHASE 10: conversations
#
#  The chat becomes a workspace rather than a single thread.
#
#    - conversations persisted per profile, listed on the left, resumable
#    - New chat, open, delete; switching profile replaces the whole list
#    - the task rail is gone. Routing, steps, kernel calls, the guard verdict
#      and the rule tree are now ONE panel under each answer, available in
#      text mode as well as interactive
#    - a full README ships with the project, ready to push to GitHub
#
#  Adds two tables, so run db:push afterwards.
#
#  Run from INSIDE the project:
#      cd ~/Desktop/taxwise
#      mv ~/Downloads/phase10-conversations.sh .
#      chmod +x phase10-conversations.sh && ./phase10-conversations.sh
set -euo pipefail
B=$'\033[1m'; DM=$'\033[2m'; G=$'\033[32m'; A=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
say(){ printf "%s\n" "${B}$1${X}"; }; note(){ printf "%s\n" "${DM}    $1${X}"; }
ok(){ printf "%s\n" "${G}  OK  $1${X}"; }; warn(){ printf "%s\n" "${A}  !!  $1${X}"; }
die(){ printf "%s\n" "${R}  XX  $1${X}"; exit 1; }
echo; say "TaxWise, Phase 10: conversations"; echo
[ -f package.json ] || die "Run this from inside the taxwise folder."
[ -d lib/db ] || die "Earlier phases are missing."
ok "found the project"
echo; say "Writing files"
wf(){ mkdir -p "$(dirname "$1")"; cat > "$1"; note "$1"; }

wf "README.md" <<'TW_EOF'
# TaxWise

**A Conversational Platform for Financial Literacy and Management using a Multi-Agent LLM Orchestrator**

BCSE497J Project-I · School of Computer Science and Engineering · Vellore Institute of Technology

M Naga Sai Dattu (23BCE0757) · Tanishq Daga (23BCE2119) · Devesh Atul Mahajan (23BCE0801)
Guide: Dr. Kalaavathi B

---

## Contents

1. [What this is](#1-what-this-is)
2. [The governing rule](#2-the-governing-rule)
3. [Quick start from an empty machine](#3-quick-start-from-an-empty-machine)
4. [Every command](#4-every-command)
5. [Architecture](#5-architecture)
6. [Project structure, file by file](#6-project-structure-file-by-file)
7. [The tools](#7-the-tools)
8. [Data model](#8-data-model)
9. [The three profiles](#9-the-three-profiles)
10. [Technology, with reasons](#10-technology-with-reasons)
11. [The three data files](#11-the-three-data-files)
12. [What is built and what is not](#12-what-is-built-and-what-is-not)
13. [Decisions, and what forced them](#13-decisions-and-what-forced-them)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What this is

Financial literacy in India is low. The National Centre for Financial Education's 2019 survey
found 27% of adults financially literate, weakest in tax and procedural knowledge. Young earners
face their first tax decision with no preparation.

The tools available fail in two different ways. **Tax portals** are calculators: they accept
figures and return figures, and assume a vocabulary the first-time filer does not have.
**General-purpose AI assistants** explain fluently but are unreliable at jurisdiction-specific
computation, which benchmark studies document rather than merely suspect.

TaxWise is the third option. One chat interface where a young earner can learn a concept, compute
a figure, and understand what it means for their money, with a structural guarantee that the
figure is correct.

Three specialist agents sit behind the chat. Ask what something means and the **Tutor** answers
from a written corpus. Ask what you owe and the **Computation** agent calls deterministic tax
functions. Ask what you spent and the **Management** agent reads your transactions.

Every answer can be read as prose or examined as a generated interface, chosen per answer.

---

## 2. The governing rule

> **The language model never produces a number that appears in an answer.**

A language model predicts text. It does not calculate; it produces text that resembles a
calculation. In a compliance domain that is unacceptable.

So the system is cut in two. **Ordinary code** performs 100% of the arithmetic. **The model**
understands the question, chooses which calculation to run, and phrases the result. It may repeat
a figure the code produced. It may never originate one.

This is enforced in four places, not asserted once:

| Where | What it prevents |
|---|---|
| Tool argument schemas | No tool accepts an income, balance or turnover from the caller, so a model cannot supply a fabricated one. Every figure is loaded from the profile inside the tool. |
| `callTool` permission check | An agent cannot reach a tool outside its declared list, whatever name the model invents. |
| Facts-only return | The model receives a flat list of named values, never the full result structure. It cannot quote what it was not handed. |
| `checkReply` guard | The finished reply is scanned for figures. Anything that did not come from a tool result causes the reply to be discarded and rewritten deterministically. |

Three properties follow, and none was separately engineered:

- **Verifiable.** The only route to a figure is a logged tool call, so the trace is that log.
- **Reproducible.** Identical inputs give identical figures, whatever the model does.
- **Degrades safely.** With no API key at all, every figure is unchanged; only the wording is plainer.

The third was observed repeatedly during development: a retired model, an overloaded endpoint and
a hallucinated tool name each changed the wording and nothing else.

---

## 3. Quick start from an empty machine

### Prerequisites

- **Node.js 20 or newer.** Check with `node -v`. Install from https://nodejs.org
- **git.** On macOS, `xcode-select --install`

Nothing else. No Docker, no local database, no GPU.

### Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000. **It works at this point with no keys and no database**, reading the
three profiles from seed files. Every tax figure is already correct.

The rest adds persistence and natural language.

### Add the database (Supabase, free)

1. Create a project at https://supabase.com. Save the database password when it is generated;
   it is shown once.
2. Click **Connect** at the top of the dashboard. You need two of the three strings offered:
   - **Transaction pooler**, port 6543 → `DATABASE_URL`
   - **Session pooler**, port 5432 → `DIRECT_URL`
   - Do **not** use *Direct connection*. It is IPv6 only and will time out on most networks.
3. Replace `[YOUR-PASSWORD]` in both, square brackets included.
4. Delete `?pgbouncer=true` if present. That is a Prisma flag and `postgres.js` rejects it.

```bash
cp .env.example .env.local     # then edit it
npm run db:push                # create the tables
npm run db:seed                # load the three profiles
npm run db:check               # confirm, with diagnostics if it fails
```

### Add the language models (free, no card)

| Provider | Key from | Serves |
|---|---|---|
| **Groq** | https://console.groq.com/keys | Orchestrator, Computation, Tutor, Management |
| **Google AI Studio** | https://aistudio.google.com/apikey | Concept embeddings |
| **OpenRouter** *(optional)* | https://openrouter.ai/keys | Configured fallback |

```
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

```bash
npm run providers    # lists the models your keys can reach, live tool-calling test
npm run bench        # times each provider on a realistic turn
```

Providers retire models on their own schedule. Both Groq and Google retired models during this
project's development, so **model ids are read from the environment** and these two scripts exist
to tell you what is actually reachable rather than trusting a hardcoded string.

### Enable retrieval by meaning

```bash
npm run corpus:embed    # enables pgvector, embeds 55 explainers
npm run corpus:check
```

Retrieval works without this, by term matching. This upgrades it to matching by meaning, which
helps on questions phrased in words the corpus does not contain.

---

## 4. Every command

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3000 |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm test` | Run the unit suite |
| `npm run ask -- "..."` | Ask a question from the terminal, no browser. `--profile ARJUN-002` to switch |
| `npm run verify` | Print every profile's full tax computation, step by step, for manual checking |
| `npm run checklist` | Print every rulebook figure a human must verify against the tax portal |
| `npm run tools` | The tool registry and the agent permission matrix |
| `npm run layers` | The layer manifest |
| `npm run providers` | Which models your keys reach, plus a live tool-calling test |
| `npm run bench` | Time each provider on a realistic turn |
| `npm run db:push` | Create or update the database tables |
| `npm run db:seed` | Load the three profiles, accounts, transactions and goals |
| `npm run db:check` | Report database contents, and diagnose common connection faults |
| `npm run db:studio` | Browse the database in a UI |
| `npm run corpus:embed` | Embed the concept corpus into pgvector |
| `npm run corpus:check` | Report how many explainers are embedded |

---

## 5. Architecture

Five layers, on the model of an operating system. The analogy carries one rule that the rest of
the design depends on: **a layer may call the layer below it and never the layer above.** The
kernel does not know the agents exist, which is what allows the arithmetic to be tested in
complete isolation from the model, the network and the interface.

```
┌───────────────────────────────────────────────────────────────┐
│  1  SHELL        conversations · chat · dual-mode · registry   │   browser
├───────────────────────────────────────────────────────────────┤
│  2  ORCHESTRATOR picks one agent, then gets out of the way     │
├───────────────────────────────────────────────────────────────┤
│  3  AGENTS       Tutor · Computation · Management              │   server
├───────────────────────────────────────────────────────────────┤
│  4  KERNEL       rule engine · tool registry · memory · agents │
├───────────────────────────────────────────────────────────────┤
│  5  DATA         Postgres tables · pgvector corpus             │   Supabase
└───────────────────────────────────────────────────────────────┘
```

**Layer 1, Shell.** The conversation list, the chat thread, the dual-mode toggle, the answer
detail panel, and a fixed component registry. The model selects a component *by name* from that
registry; it never writes interface code, because free-form generation would be neither safe nor
reproducible.

**Layer 2, Orchestrator.** Reads the question, decides which agent owns it, hands over. It holds
no tools, keeps no memory and produces no user-facing text.

Routing is **keyword-first**. An unambiguous domain word resolves in under a millisecond with no
model call. The model is consulted only when the keywords are unsure, because a model classified
"which regime is better for me" as a teaching question and took 1,384 ms to be wrong, where a
keyword match on *regime* is right every time in 1 ms.

**Layer 3, Agents.** Three specialists, separated not by prompt but by the set of tools each may
invoke. The Tutor is not instructed to avoid tax functions; it is structurally unable to reach
them.

**Layer 4, Kernel.** The rule engine, the tool registry, the memory manager and the agent
registry. Every call into the kernel passes through one function, `callTool`, which checks the
tool exists, checks the agent may call it, validates the arguments, runs it, and writes a row to
`audit_log`. That last step is why the trace was never separately built.

**Layer 5, Data.** Relational tables for exact values retrieved by key, and a pgvector table for
explanatory prose retrieved by meaning. **They never intersect.** Vector search is approximate by
construction: asking it for a statutory ceiling returns a passage *about* that ceiling, from which
something would have to extract a figure, and that something would be the model.

### What crosses the boundary

`app/api/chat/route.ts` is the only door between browser and server. Nothing in the browser can
reach the kernel except through it, so nothing can bypass the tool registry or the audit log.

API keys live in `.env.local` and only server files can read them. Next.js refuses to send server
environment variables to the browser.

---

## 6. Project structure, file by file

```
taxwise/
├── app/                        routes and the API
│   ├── page.tsx                renders the chat
│   ├── layout.tsx              wraps every page
│   ├── globals.css             Tailwind entry
│   ├── status/page.tsx         build dashboard at /status
│   └── api/
│       ├── chat/route.ts       one turn: routes, runs, persists, returns
│       └── conversations/route.ts   list, open and delete conversations
│
├── components/                 everything the browser draws
│   ├── Chat.tsx                the chat screen and all its state
│   ├── ConversationList.tsx    left pane: conversations, new, delete
│   ├── AnswerDetail.tsx        one panel: routing, steps, kernel calls, guard, the working
│   ├── ModeToggle.tsx          text or interactive, per answer
│   └── widgets/
│       ├── index.tsx           the component registry
│       ├── ui.tsx              Card, Label, Bar, Indian digit grouping
│       ├── TraceTree.tsx       the collapsible rule tree
│       ├── RegimeComparison.tsx
│       ├── TaxBreakdown.tsx
│       ├── DeductionOptimizer.tsx
│       ├── PresumptiveComparison.tsx
│       ├── SpendingBreakdown.tsx
│       ├── NetWorth.tsx
│       ├── GoalProgress.tsx
│       ├── GstSummary.tsx
│       ├── ConceptAnswer.tsx
│       └── FactCard.tsx        generic fallback for results without a bespoke component
│
├── lib/
│   ├── env.ts                  loads .env.local, which dotenv does not do by default
│   ├── layers.ts               the layer manifest, read by /status
│   │
│   ├── orchestrator/
│   │   ├── route.ts            keyword-first routing, model only when unsure
│   │   └── index.ts            routing plus agent execution, creates the task record
│   │
│   ├── agents/
│   │   ├── providers.ts        which provider serves which agent, timeouts, model ids
│   │   ├── prompts.ts          per-agent instructions, including the follow-up format
│   │   ├── run.ts              runs one agent: tools, retry, guard, fallback
│   │   ├── fallback.ts         deterministic tool choice when no model is available
│   │   ├── describe.ts         deterministic phrasing when the model fails or is rejected
│   │   └── followups.ts        follow-up questions, model-proposed with a fixed fallback
│   │
│   ├── kernel/
│   │   ├── types.ts            TraceNode, TaxInput, TaxResult, Slab, Deductions
│   │   ├── money.ts            Indian digit grouping, whole-rupee rounding
│   │   ├── rules.ts            reads the rulebook; exposes labels, never raw rates, to a model
│   │   ├── slabs.ts            walks the bands, taxing only the income inside each
│   │   ├── hra.ts              least of three, returning all three and which won
│   │   ├── deductions.ts       applies statutory ceilings, recording where a claim was trimmed
│   │   ├── tax.ts              composes the above in order, emitting the trace as it computes
│   │   ├── regimes.ts          both regimes, recommends the cheaper
│   │   ├── optimize.ts         unused headroom and the real saving from filling it
│   │   ├── business.ts         GST, presumptive taxation, advance tax, 194J, deadlines
│   │   ├── management.ts       net worth, spending categories, savings rate, goal progress
│   │   ├── concepts.ts         term-matching retrieval over the corpus
│   │   ├── retrieval.ts        tries vector search, falls back to term matching
│   │   ├── guard.ts            catches invented figures, normalises the ones it did not
│   │   ├── agents.ts           the permission lists: the isolation guarantee
│   │   ├── profiles.ts         seed fixtures and conversion into engine inputs
│   │   └── tools/
│   │       ├── types.ts        ToolSpec, ToolResult, permission errors
│   │       ├── registry.ts     all tools: name, description, schema, function, component
│   │       └── execute.ts      the doorway: permission, validation, execution, logging
│   │
│   └── db/
│       ├── schema.ts           the tables
│       ├── client.ts           the connection, with prepare: false
│       ├── repositories.ts     every read and write, with a seed fallback
│       └── concepts.ts         vector search and query embedding
│
├── data/
│   ├── tax_rules.json          the versioned rulebook
│   ├── profiles.json           the three fixtures
│   └── concepts.json           55 explainers, containing no figures
│
├── scripts/                    command-line tools, not part of the running app
│   ├── ask.ts, verify.ts, checklist.ts, tools.ts, layers.ts
│   ├── seed.ts, db-check.ts, corpus.ts
│   └── providers-check.ts, bench.ts
│
└── tests/
```

---

## 7. The tools

Each is a typed function exposed to the model through the AI SDK. The model sees a name, a
description written for a reader, and an argument shape. It never sees an implementation.

**Note what the schemas do not contain.** No tool accepts a rupee amount from the caller. The
most a model may supply is a *choice*: which regime, which section, how much to hypothetically
invest.

| Tool | Agent | Returns |
|---|---|---|
| `get_profile_summary` | all | occupation, city, income, rent, deductions claimed |
| `get_deadlines` | Computation, Management | statutory deadlines that apply to this user |
| `compute_tax` | Computation | full liability under one regime, with the derivation |
| `compare_regimes` | Computation | both regimes and the cheaper one |
| `compute_hra_exemption` | Computation | all three candidates and which was lowest |
| `optimize_deductions` | Computation | unused headroom ranked by rupee saving |
| `what_if_deduction` | Computation | tax before and after a hypothetical investment |
| `compute_gst` | Computation | output GST, input credit, net payable, registration status |
| `presumptive_vs_books` | Computation | 44AD or 44ADA against regular books, with conditions |
| `compute_advance_tax` | Computation | whether due, and the instalment schedule |
| `compute_194j_tds` | Computation | expected against actual TDS on professional fees |
| `compute_net_worth` | Management | balances across connected accounts |
| `categorize_spending` | Management | outgoing transactions grouped by category |
| `compute_savings_rate` | Management | what remains of net income after spending |
| `compute_goal_progress` | Management | progress and months to target at the current rate |
| `list_recent_transactions` | Management | most recent transactions across accounts |
| `list_deduction_sections` | Tutor | section names and descriptions, never amounts |
| `search_concepts` | Tutor | explanatory prose, never figures |

Run `npm run tools` for the live permission matrix.

### Two implementations worth knowing

**`optimizeDeductions` re-runs the entire tax engine** with a section filled to its cap, rather
than multiplying headroom by an assumed marginal rate. The naive method is wrong near a slab
boundary and badly wrong near the section 87A threshold, where tax drops to zero in one step
rather than tapering.

**Every kernel function emits its trace while computing.** The trace is a byproduct of the
arithmetic rather than a reconstruction after the fact, which is what makes it trustworthy.

---

## 8. Data model

Nine tables in Supabase. Rupee amounts are stored as **whole-rupee integers, never floats**: the
kernel rounds at every step because the Act requires it, and a float would reintroduce the
imprecision that rounding removed.

| Table | Holds |
|---|---|
| `profiles` | The three fixtures: occupation, city, income, rent, deductions |
| `accounts` | Bank accounts per profile, personal and business |
| `transactions` | Seeded history, plus anything added later |
| `goals` | Savings goals with target and current amount |
| `conversations` | One per chat thread, scoped to a profile, titled from the first message |
| `chat_messages` | Every message, with a `payload` holding everything needed to redraw the answer |
| `tasks` | One per orchestrator invocation |
| `audit_log` | **One row per tool call. This table is the verifiable trace.** |
| `memory` | One dossier per profile |

Plus `concepts`, created separately by `npm run corpus:embed`, holding the embedded corpus. It is
created with raw SQL rather than through the Drizzle schema, because a vector column cannot exist
until the pgvector extension does, and requiring that would break `db:push` for anyone who has
not enabled it.

**Everything is scoped by `profile_id`.** There is no authentication in this build, which is
recorded as out of scope; separation is enforced by filtering every query on the profile rather
than by a session.

**Every read falls back to the seed files.** That is not a convenience. It means a paused or
unreachable database cannot stop the system, and the whole thing can be exercised on a laptop
with nothing configured.

---

## 9. The three profiles

Test fixtures, not demo dressing. Each exercises a distinct branch of the tax code, and each sits
deliberately on a boundary. A fixture comfortably in the middle of every range tests nothing.

### Priya, 24, software engineer, Bengaluru — salaried

| | |
|---|---|
| Gross salary | ₹12,00,000 |
| Basic / HRA received | ₹6,00,000 / ₹3,00,000 |
| Rent | ₹25,000 per month |
| City | non-metro, so 40% of basic applies |
| 80C claimed | ₹50,000 |

New regime **₹0**, old regime **₹87,880**. HRA exemption **₹2,40,000**, the lowest of three.

Her ₹0 is the most valuable assertion in the project: it exercises the standard deduction, the
slab table and the 87A rebate at once, so a bug in any one changes the answer.

### Arjun, 28, business owner, Mumbai

| | |
|---|---|
| Turnover | ₹24,00,000 |
| Business expenses | ₹9,00,000 |
| Digital receipts | 95%, so 44AD applies at the lower rate |
| City | Mumbai, metro |

Section 44AD deems **₹1,44,000** against **₹15,00,000** from books. GST registration **required**,
turnover being above the threshold.

### Rohan, 26, freelance designer, Pune — professional

| | |
|---|---|
| Gross receipts | ₹18,00,000 (₹10,00,000 export, ₹8,00,000 domestic) |
| Business expenses | ₹4,00,000 |
| TDS deducted by clients | ₹80,000 |

Section 44ADA deems **₹9,00,000** against ₹14,00,000 from books. **₹2,00,000 of headroom** below
the GST threshold, because exports are zero-rated. Section 194J expected ₹1,80,000 against
₹80,000 actually deducted.

**Two corrections are recorded in `profiles.json` under `_meta.assumptions`:** salary breakups
were added, because a gross package alone cannot produce an HRA exemption and no source specified
one; and Rohan's turnover split was corrected, because the original figures had his overseas
income exceeding his stated total turnover.

---

## 10. Technology, with reasons

| Layer | Technology | Version | Why |
|---|---|---|---|
| Language | TypeScript | 5.9.3 | Type errors surface before runtime, which matters most where a wrong number is the worst outcome |
| Framework | Next.js | 16.3.4 | Interface and server logic in one deployable project |
| UI | React | 19.2.8 | Required 19.0.1 or newer by the RSC package |
| Styling | Tailwind CSS | 3.4.18 | Styles colocated with markup |
| AI toolkit | `ai` | 7.0.93 | Provider-independent tool schemas. Tool arguments use `inputSchema` in v7, not `parameters` |
| Providers | `@ai-sdk/groq` | 4.0.37 | Measured at 1,407 ms with tool calling |
| | `@ai-sdk/google` | 4.0.64 | Measured at 29,277 ms; used for embeddings, where nobody waits |
| | `@openrouter/ai-sdk-provider` | 3.0.0 | Configured fallback |
| Validation | Zod | 3.25.76 | Typed tool arguments. This is the mechanism that enforces the tool boundary |
| Database | Supabase (Postgres + pgvector) | hosted | Relational tables and vector search in one free project |
| Driver | `postgres` | 3.4.7 | `prepare: false` is mandatory for Supabase's transaction pooler |
| ORM | Drizzle | 0.45.2 | Schema in TypeScript, reviewable and versioned with the code |
| Testing | Vitest | 3.2.4 | Kernel assertions with no interface or network |

**Total cost: zero.** Every service used has a permanent free tier requiring no payment
instrument.

### Provider assignment was measured, not assumed

```
groq         1,407 ms   tool calling works
gemini      29,277 ms   timed out on both runs
openrouter      733 ms   responded but did not call the tool
```

So Groq serves every agent a person waits on, and Gemini produces the concept embeddings, where a
single 700 ms call before anybody is waiting costs nothing. Run `npm run bench` on your own
connection; override with `AGENT_TUTOR_PROVIDER`, `AGENT_COMPUTATION_PROVIDER` and
`AGENT_MANAGEMENT_PROVIDER` in `.env.local`.

Every model call carries a **12-second timeout**. If a provider hangs, the call is abandoned and
the deterministic path answers instead. A Tutor reply once took 31 seconds; the timeout means no
question can hang again, whatever a provider does on the day.

---

## 11. The three data files

### `data/tax_rules.json`

Every slab, ceiling, rate and deadline, in nine sections: `regimes`, `cess`, `deductions`, `hra`,
`gst`, `presumptive`, `tds`, `advanceTax`, `calendar`.

**The model never reads raw numbers from it.** It sees section names and plain-English labels only,
for phrasing.

`_meta.verification` records who checked the figures against the official rate tables and when.
`npm run checklist` prints every figure with a box to tick. `_gaps` lists what is deliberately not
implemented: surcharge above 50 lakh, marginal relief, senior citizen slabs, capital gains. No
fixture reaches any of those.

### `data/profiles.json`

The three fixtures, with `_meta.assumptions` recording what was added and corrected.

### `data/concepts.json`

55 explainers across seven categories: tax basics 10, regimes 6, deductions 9, salary 5,
freelance 8, GST 5, money management 12.

**No explainer contains a rupee amount, a rate or a threshold.** This is structural rather than
stylistic: the Tutor may quote its corpus verbatim, so a figure in the corpus would let the Tutor
state one, breaking the governing rule through the back door. Where a figure is needed, the text
names the tool that supplies it, which produces the handoff to the Computation agent.

---

## 12. What is built and what is not

### Built

Conversations, persisted and resumable per profile · chat surface · dual-mode toggle · answer
detail panel with routing, steps, kernel calls, guard verdict and the rule tree · follow-up
suggestions, model-proposed with a fixed fallback · component registry with eight bespoke
components and a generic fallback · orchestrator routing · all three agents · rule engine ·
tool registry with trace logging · agent registry · compliance calendar · retrieval over the
corpus, by meaning and by term · three providers assigned by measured latency.

### Designed, not yet implemented

Memory manager, the dossier per profile · proactive monitor, polling for changes · causal finance
graph, forward and backward · ITR autopilot · payments gateway · invoice generator · investment
comparator · functionality pane per user type.

### Out of scope entirely

No bank integration. No Account Aggregator, DigiLocker or UPI. No submission to any government
system. No GST portal integration. No voice or camera input. No authentication. No production
hardening.

---

## 13. Decisions, and what forced them

| Decision | What forced it |
|---|---|
| The model never produces a figure | Published benchmarks showing LLMs err on tax computation |
| Tools inside the kernel, not a separate layer | Objective 5 says the kernel manages the agents, tools and memory |
| Agents separated by permitted tools | An instruction can be disregarded; an absent capability cannot |
| Chat-first, no navigation | The aim says the user interacts entirely through a chatbot |
| Keyword routing first, model second | Measured: a model sent "which regime is better" to the Tutor |
| Fixed component registry | Free-form UI generation is neither safe nor reproducible |
| Corpus contains no figures | The Tutor may quote it verbatim |
| Deterministic guard, not a model check | A model asked to check arithmetic can agree with a wrong answer |
| Normalise before checking | A model wrote "2.4 million" for 2400000; it had rescaled, not invented |
| Seed fallback on every read | A paused database must not stop the system |
| Model ids from the environment | Groq and Google both retired models during development |
| Groq for interactive agents | Measured 1,407 ms against Gemini's 29,277 ms |
| 12-second call timeout | A Tutor reply took 31 seconds |
| 800 ms embedding budget | Term matching answers the same question instantly |
| One retrieval per turn | The model called it twice, paying the cost twice |
| Rupees as integers, not floats | A float reintroduces the imprecision rounding removed |
| `prepare: false` | Supabase's transaction pooler rejects prepared statements |
| Session pooler for migrations | Transaction pooling does not carry DDL across statements |
| Rulebook typed by hand, not parsed | A parser adds a failure mode to the one file that must be perfect |

---

## 14. Troubleshooting

**`npm run db:push` says `url: ''`**
`.env.local` is not being read, or `DIRECT_URL` is empty. Run `npm run db:check`, which prints
both strings with the password masked.

**Database connects but queries fail intermittently**
`prepare: false` is missing, or `?pgbouncer=true` is still on `DATABASE_URL`. That is a Prisma
flag and `postgres.js` rejects it.

**Connection times out with no error**
The *Direct connection* string is being used. It is IPv6 only. Use the pooler strings.

**A model id is rejected as no longer available**
Run `npm run providers`. It lists what your keys can actually reach and names the environment
variable to set.

**Replies are slow**
Run `npm run bench`. Put the fastest provider in front with `AGENT_*_PROVIDER` in `.env.local`.

**Every answer says "deterministic phrasing"**
No model is reachable. Figures are still correct. Run `npm run providers` to see why.

**The Tutor says the corpus is not loaded**
Run `npm run corpus:embed`, or rely on term matching, which needs no setup.

**Conversations do not persist**
No database is connected. The chat still works; the list stays empty. Run `npm run db:check`.
TW_EOF

wf "lib/db/schema.ts" <<'TW_EOF'
import {
  pgTable, text, integer, bigint, boolean, timestamp, jsonb, uuid, index,
} from "drizzle-orm/pg-core";

/**
 * Layer 5, the data layer.
 *
 * Two rules govern this schema.
 *
 * Rupee amounts are stored as whole-rupee integers, never as floating point.
 * The kernel rounds to whole rupees at every step because the Act requires it,
 * and a float would reintroduce the imprecision that rounding removed.
 *
 * Anything the kernel needs in order to compute is a real column. Anything the
 * kernel only carries around is jsonb. That keeps the columns that matter
 * queryable and typed, without inventing a table for every nested shape.
 */

/* ------------------------------------------------------------ profiles */
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),                       // PRIYA-001
  name: text("name").notNull(),
  age: integer("age").notNull(),
  occupation: text("occupation").notNull(),          // salaried | business | profession
  jobTitle: text("job_title").notNull(),
  city: text("city").notNull(),
  isMetro: boolean("is_metro").notNull(),
  exercises: text("exercises").notNull(),            // which rules this fixture covers
  rentMonthly: bigint("rent_monthly", { mode: "number" }).notNull(),
  income: jsonb("income").notNull(),                 // gross, basic, HRA, turnover, receipts
  deductions: jsonb("deductions").notNull(),         // { "80C": 50000, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------ accounts */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  bankName: text("bank_name").notNull(),
  maskedNumber: text("masked_number").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
  accountType: text("account_type").notNull(),       // personal | business
}, (t) => [index("accounts_profile_idx").on(t.profileId)]);

/* -------------------------------------------------------- transactions */
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  direction: text("direction").notNull(),            // credit | debit
  merchant: text("merchant").notNull(),
  category: text("category").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  // Distinguishes pre-seeded history from rows injected live during a demo.
  source: text("source").notNull().default("seeded"),
}, (t) => [index("transactions_account_idx").on(t.accountId)]);

/* --------------------------------------------------------------- goals */
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
  currentAmount: bigint("current_amount", { mode: "number" }).notNull().default(0),
  targetDate: text("target_date"),
});

/* ------------------------------------------------------- conversations */
/**
 * A conversation is the unit a user actually works in, in the way a chat
 * application works: a list on the left, click to reopen, a button to start a
 * new one. Everything is scoped to one profile, so switching profile switches
 * the entire list.
 */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  // Taken from the first message, which is the cheapest title that is still
  // recognisable a week later.
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("conversations_profile_idx").on(t.profileId)]);

/* ------------------------------------------------------- chat messages */
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                      // user | assistant
  content: text("content").notNull(),
  agent: text("agent"),                              // which agent answered
  provider: text("provider"),                        // which model, or deterministic
  mode: text("mode"),                                // text | interactive
  component: text("component"),                      // registry key, when interactive
  /**
   * Everything needed to redraw the answer exactly as it first appeared:
   * tool results with their facts and traces, the routing decision, the agent
   * steps, the guard verdict and the follow-up suggestions. Stored together
   * because it is always read together and never queried into.
   */
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("chat_conversation_idx").on(t.conversationId),
  index("chat_profile_idx").on(t.profileId),
]);

/* --------------------------------------------------------------- tasks */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"), // pending|running|completed|failed
  agent: text("agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ----------------------------------------------------------- audit log */
/**
 * One row per tool invocation. This table IS the verifiable trace: nothing
 * else is written to produce it. Objective 3 is satisfied by the fact that
 * a figure cannot reach the user without a row appearing here first.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull(),
  toolName: text("tool_name").notNull(),
  args: jsonb("args").notNull(),
  facts: jsonb("facts").notNull(),                   // every number the tool produced
  trace: jsonb("trace").notNull(),                   // the TraceNode tree
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_task_idx").on(t.taskId)]);

/* -------------------------------------------------------------- memory */
export const memory = pgTable("memory", {
  profileId: text("profile_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  dossier: jsonb("dossier").notNull(),               // preferences, decisions, open questions
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConversationRow = typeof conversations.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
TW_EOF

wf "lib/db/repositories.ts" <<'TW_EOF'
import { eq } from "drizzle-orm";
import { db, hasDatabase } from "./client";
import { and, desc, eq as eqq } from "drizzle-orm";
import { profiles, accounts, transactions, goals, auditLog, memory, tasks, conversations, chatMessages } from "./schema";
import { allProfiles as seedProfiles, type Profile } from "@/lib/kernel/profiles";
import type { TraceNode } from "@/lib/kernel/types";

/**
 * Every read of persisted data goes through this file.
 *
 * Each function tries the database first and falls back to the seed fixtures
 * when no database is configured. The fallback is not a convenience: it is what
 * lets the kernel and the agents be exercised with nothing but a laptop, and it
 * means a paused or unreachable database cannot stop a demonstration.
 */

export type DataSource = "database" | "seed";

export async function source(): Promise<DataSource> {
  if (!hasDatabase()) return "seed";
  try {
    const d = db();
    if (!d) return "seed";
    await d.select({ id: profiles.id }).from(profiles).limit(1);
    return "database";
  } catch {
    return "seed";
  }
}

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    name: r.name as string,
    age: r.age as number,
    occupation: r.occupation as Profile["occupation"],
    jobTitle: r.jobTitle as string,
    city: r.city as string,
    isMetro: r.isMetro as boolean,
    exercises: r.exercises as string,
    rentMonthly: r.rentMonthly as number,
    income: r.income as Profile["income"],
    deductions: r.deductions as Record<string, number>,
    bank: { name: "", maskedNumber: "", balance: 0, type: "personal" },
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const d = db();
  if (!d) return seedProfiles();
  try {
    const rows = await d.select().from(profiles);
    if (rows.length === 0) return seedProfiles();
    return rows.map((r) => rowToProfile(r as unknown as Record<string, unknown>));
  } catch {
    return seedProfiles();
  }
}

export async function findProfile(id: string): Promise<Profile | undefined> {
  return (await listProfiles()).find((p) => p.id.toUpperCase() === id.toUpperCase());
}

export async function listAccounts(profileId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(accounts).where(eq(accounts.profileId, profileId));
  } catch {
    return [];
  }
}

export async function listTransactions(accountId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(transactions).where(eq(transactions.accountId, accountId));
  } catch {
    return [];
  }
}

export async function listGoals(profileId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(goals).where(eq(goals.profileId, profileId));
  } catch {
    return [];
  }
}

/**
 * Append one tool invocation to the audit log. This is the only writer of that
 * table and the only mechanism by which a trace comes into existence.
 * Failure to record is swallowed deliberately: losing a log line must never
 * suppress a correct answer the user is waiting for.
 */
export async function recordToolCall(entry: {
  profileId: string;
  taskId?: string;
  toolName: string;
  args: unknown;
  facts: Record<string, number | string>;
  trace: TraceNode | null;
  durationMs: number;
}): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.insert(auditLog).values({
      profileId: entry.profileId,
      taskId: entry.taskId ?? null,
      toolName: entry.toolName,
      args: entry.args as object,
      facts: entry.facts as object,
      trace: (entry.trace ?? {}) as object,
      durationMs: entry.durationMs,
    });
  } catch {
    /* logging must never break an answer */
  }
}

export async function readMemory(profileId: string): Promise<Record<string, unknown> | null> {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.select().from(memory).where(eq(memory.profileId, profileId)).limit(1);
    return (rows[0]?.dossier as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export async function writeMemory(profileId: string, dossier: Record<string, unknown>): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.insert(memory).values({ profileId, dossier })
      .onConflictDoUpdate({ target: memory.profileId, set: { dossier, updatedAt: new Date() } });
  } catch { /* ignore */ }
}

export async function createTask(profileId: string, title: string, agent?: string) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(tasks).values({ profileId, title, agent, status: "running" }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function finishTask(taskId: string, status: "completed" | "failed") {
  const d = db();
  if (!d) return;
  try {
    await d.update(tasks).set({ status, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  } catch { /* ignore */ }
}

/* ====================================================== conversations */

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent: string | null;
  provider: string | null;
  mode: string | null;
  component: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** A title a person will still recognise later, taken from the first message. */
export function titleFrom(message: string): string {
  const t = message.trim().replace(/\s+/g, " ");
  if (t.length <= 48) return t;
  return t.slice(0, 45).replace(/[,;:\s]+\S*$/, "") + "...";
}

export async function listConversations(profileId: string): Promise<ConversationSummary[]> {
  const d = db();
  if (!d) return [];
  try {
    const rows = await d.select().from(conversations)
      .where(eqq(conversations.profileId, profileId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map((r) => ({
      id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function createConversation(profileId: string, firstMessage: string) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(conversations)
      .values({ profileId, title: titleFrom(firstMessage) }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function touchConversation(conversationId: string) {
  const d = db();
  if (!d) return;
  try {
    await d.update(conversations).set({ updatedAt: new Date() })
      .where(eqq(conversations.id, conversationId));
  } catch { /* ignore */ }
}

export async function deleteConversation(conversationId: string, profileId: string) {
  const d = db();
  if (!d) return false;
  try {
    // Scoped by profile as well as id, so one profile can never delete
    // another's conversation even if an id leaks.
    await d.delete(conversations).where(
      and(eqq(conversations.id, conversationId), eqq(conversations.profileId, profileId))
    );
    return true;
  } catch {
    return false;
  }
}

export async function listMessages(conversationId: string): Promise<StoredMessage[]> {
  const d = db();
  if (!d) return [];
  try {
    const rows = await d.select().from(chatMessages)
      .where(eqq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
    return rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      agent: r.agent,
      provider: r.provider,
      mode: r.mode,
      component: r.component,
      payload: (r.payload as Record<string, unknown>) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function appendMessage(m: {
  conversationId: string;
  profileId: string;
  role: "user" | "assistant";
  content: string;
  agent?: string | null;
  provider?: string | null;
  mode?: string | null;
  component?: string | null;
  payload?: unknown;
}) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(chatMessages).values({
      conversationId: m.conversationId,
      profileId: m.profileId,
      role: m.role,
      content: m.content,
      agent: m.agent ?? null,
      provider: m.provider ?? null,
      mode: m.mode ?? null,
      component: m.component ?? null,
      payload: (m.payload ?? null) as object,
    }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
TW_EOF

wf "app/api/chat/route.ts" <<'TW_EOF'
import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/orchestrator";
import { createConversation, appendMessage, touchConversation } from "@/lib/db/repositories";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One turn of a conversation.
 *
 * The conversation is created on the first message and identified by id
 * thereafter. Both the question and the answer are persisted, and the answer
 * carries everything needed to redraw it later: the tool results with their
 * facts and traces, the routing decision, the agent steps, the guard verdict
 * and the suggestions. That is what makes a conversation resumable rather than
 * merely logged.
 *
 * Persistence never blocks an answer. If the database is unreachable the reply
 * is still returned and the conversation simply lives in the browser for that
 * session.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = String(body.message ?? "").slice(0, 2000).trim();
    const profileId = String(body.profileId ?? "PRIYA-001");
    let conversationId: string | null = body.conversationId ? String(body.conversationId) : null;

    if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    let conversationTitle: string | null = null;
    if (!conversationId) {
      const c = await createConversation(profileId, message);
      if (c) { conversationId = c.id; conversationTitle = c.title; }
    }

    if (conversationId) {
      await appendMessage({ conversationId, profileId, role: "user", content: message });
    }

    const r = await orchestrate({ message, profileId });

    const results = r.answer.toolResults.map((t) => ({
      tool: t.tool, component: t.component, facts: t.facts,
      data: t.data, trace: t.trace, durationMs: t.durationMs,
    }));

    const payload = {
      results,
      route: r.route,
      steps: r.answer.steps,
      guard: r.answer.guard,
      degraded: r.answer.degraded,
      suggestions: r.answer.suggestions,
      suggestionSource: r.answer.suggestionSource,
      totalMs: r.totalMs,
    };

    if (conversationId) {
      await appendMessage({
        conversationId, profileId, role: "assistant",
        content: r.answer.text,
        agent: r.answer.agent,
        provider: r.answer.provider,
        mode: r.answer.component !== "none" ? "interactive" : "text",
        component: r.answer.component,
        payload,
      });
      await touchConversation(conversationId);
    }

    return NextResponse.json({
      conversationId,
      conversationTitle,
      agent: r.answer.agent,
      provider: r.answer.provider,
      text: r.answer.text,
      component: r.answer.component,
      ...payload,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
TW_EOF

wf "app/api/conversations/route.ts" <<'TW_EOF'
import { NextResponse } from "next/server";
import { listConversations, listMessages, deleteConversation } from "@/lib/db/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations?profileId=X            list a profile's conversations
 * GET /api/conversations?profileId=X&id=Y       open one, with its messages
 *
 * Every query is scoped by profile. There is no authentication in this build,
 * which is deliberate and recorded as out of scope, so scoping is enforced by
 * always filtering on profileId rather than by trusting the caller.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") ?? "";
  const id = url.searchParams.get("id");

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  if (id) {
    const all = await listConversations(profileId);
    const owned = all.find((c) => c.id === id);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ conversation: owned, messages: await listMessages(id) });
  }

  return NextResponse.json({ conversations: await listConversations(profileId) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!profileId || !id) return NextResponse.json({ error: "profileId and id required" }, { status: 400 });
  return NextResponse.json({ deleted: await deleteConversation(id, profileId) });
}
TW_EOF

wf "components/Chat.tsx" <<'TW_EOF'
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList, { type ConversationSummary } from "./ConversationList";
import AnswerDetail, { type ResultPayload, type Step, type Route } from "./AnswerDetail";
import ModeToggle, { type Mode } from "./ModeToggle";
import { renderWidget } from "./widgets";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  agent?: string;
  provider?: string;
  results?: ResultPayload[];
  component?: string;
  mode?: Mode;
  degraded?: boolean;
  failed?: boolean;
  suggestions?: string[];
  suggestionSource?: "model" | "fixed";
  route?: Route | null;
  steps?: Step[];
  guard?: { ok: boolean; offending: string[] } | null;
  totalMs?: number;
}

interface ProfileOption { id: string; name: string; jobTitle: string; occupation: string }

const STARTERS: Record<string, string[]> = {
  salaried: ["Which regime is better for me?", "How can I pay less tax?", "What is section 80C?", "How much did I spend?"],
  business: ["Should I use presumptive taxation?", "How much GST do I owe?", "When is my advance tax due?", "What is my net worth?"],
  profession: ["Should I use presumptive taxation?", "Am I close to the GST threshold?", "What is 194J?", "How are my goals doing?"],
};

export default function Chat({ profiles }: { profiles: ProfileOption[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "PRIYA-001");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noDb, setNoDb] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const starters = STARTERS[profile?.occupation ?? "salaried"] ?? STARTERS.salaried;

  const loadConversations = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/conversations?profileId=${encodeURIComponent(pid)}`);
      const j = await res.json();
      setConversations(j.conversations ?? []);
    } catch {
      setConversations([]);
    }
  }, []);

  // Switching profile replaces the whole workspace: a different person's
  // conversations, and none of the previous one's messages.
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    loadConversations(profileId);
  }, [profileId, loadConversations]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function openConversation(id: string) {
    setConversationId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/conversations?profileId=${encodeURIComponent(profileId)}&id=${id}`);
      const j = await res.json();
      const loaded: Message[] = (j.messages ?? []).map((m: Record<string, unknown>) => {
        const p = (m.payload ?? {}) as Record<string, unknown>;
        return {
          id: m.id as string,
          role: m.role as "user" | "assistant",
          text: m.content as string,
          agent: (m.agent as string) ?? undefined,
          provider: (m.provider as string) ?? undefined,
          component: (m.component as string) ?? undefined,
          mode: (m.mode as Mode) ?? "text",
          results: (p.results as ResultPayload[]) ?? [],
          steps: (p.steps as Step[]) ?? [],
          route: (p.route as Route) ?? null,
          guard: (p.guard as Message["guard"]) ?? null,
          suggestions: (p.suggestions as string[]) ?? [],
          suggestionSource: p.suggestionSource as "model" | "fixed" | undefined,
          degraded: p.degraded as boolean | undefined,
          totalMs: p.totalMs as number | undefined,
        };
      });
      setMessages(loaded);
    } catch { /* leave empty */ }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
  }

  async function removeConversation(id: string) {
    setConversations((c) => c.filter((x) => x.id !== id));
    if (id === conversationId) newChat();
    try {
      await fetch(`/api/conversations?profileId=${encodeURIComponent(profileId)}&id=${id}`, { method: "DELETE" });
    } catch { /* the list is already updated */ }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const key = Math.random().toString(36).slice(2);
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: key + "u", role: "user", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, profileId, conversationId }),
      });
      const j = await res.json();

      if (j.error) {
        setMessages((m) => [...m, { id: key, role: "assistant", text: j.error, failed: true }]);
        return;
      }

      if (j.conversationId && j.conversationId !== conversationId) {
        setConversationId(j.conversationId);
      }
      if (!j.conversationId) setNoDb(true);

      setMessages((m) => [...m, {
        id: key, role: "assistant", text: j.text,
        agent: j.agent, provider: j.provider,
        results: j.results ?? [], component: j.component,
        mode: j.component && j.component !== "none" ? "interactive" : "text",
        degraded: j.degraded,
        suggestions: j.suggestions ?? [],
        suggestionSource: j.suggestionSource,
        route: j.route ?? null, steps: j.steps ?? [], guard: j.guard ?? null,
        totalMs: j.totalMs,
      }]);

      loadConversations(profileId);
    } catch {
      setMessages((m) => [...m, {
        id: key, role: "assistant",
        text: "The request failed. Is the dev server still running?", failed: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  const setMode = (id: string, mode: Mode) =>
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, mode } : x)));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold tracking-tight text-ink">TaxWise</span>
          <span className="text-[9.5px] text-ink/45">FY 2025-26 &middot; simulated data</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/status" className="text-[10px] text-ink/45 hover:text-ink hover:underline">status</a>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="rounded border border-rule bg-white px-2 py-1 text-[10.5px]"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name} &middot; {p.jobTitle}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          onOpen={openConversation}
          onNew={newChat}
          onDelete={removeConversation}
          unavailable={noDb}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#F7F9FC]">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 && (
                <div className="py-14 text-center">
                  <p className="text-sm font-semibold text-ink">Ask about {profile?.name}&apos;s money.</p>
                  <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-snug text-ink/50">
                    Every figure you see is computed by a rule engine, not by the language model.
                    Open <span className="font-medium">how this was answered</span> under any reply to see which rule produced it.
                  </p>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className="mb-5">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-lg bg-ink px-3 py-2 text-[12px] text-white">{m.text}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-amber/15 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-amber">
                          {m.agent}
                        </span>
                        {m.degraded && (
                          <span className="rounded bg-ink/8 px-1.5 py-px text-[8.5px] font-bold uppercase text-ink/50">
                            deterministic phrasing
                          </span>
                        )}
                      </div>

                      <p className={"text-[12.5px] leading-relaxed " + (m.failed ? "text-red-700" : "text-ink/85")}>
                        {m.text}
                      </p>

                      {m.results && m.results.length > 0 && (
                        <>
                          <div className="mt-2">
                            <ModeToggle mode={m.mode ?? "text"} onChange={(mode) => setMode(m.id, mode)} />
                          </div>
                          {m.mode === "interactive" && (
                            <div className="mt-2 space-y-2">
                              {m.results.map((r, i) => (
                                <div key={i}>{renderWidget(r.component, r.data, r.facts, r.trace)}</div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <AnswerDetail
                        route={m.route ?? null}
                        steps={m.steps ?? []}
                        results={m.results ?? []}
                        guard={m.guard ?? null}
                        provider={m.provider}
                        totalMs={m.totalMs}
                      />

                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="mt-2.5">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[9px] uppercase tracking-wide text-ink/35">next</span>
                            <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
                              (m.suggestionSource === "model" ? "bg-teal/15 text-teal" : "bg-ink/8 text-ink/45")}>
                              {m.suggestionSource === "model" ? "suggested" : "standard"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.suggestions.map((s) => (
                              <button key={s} onClick={() => send(s)} disabled={busy}
                                className="rounded-full border border-teal/40 bg-teal/5 px-2.5 py-1 text-[10px] text-teal hover:bg-teal/10 disabled:opacity-40">
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[11px] text-ink/45">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                  routing, calling the kernel, checking the reply
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-rule bg-white px-6 py-3">
            <div className="mx-auto max-w-3xl">
              <div className={"mb-2 flex-wrap gap-1.5 " + (messages.length === 0 ? "flex" : "hidden")}>
                {starters.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy}
                    className="rounded-full border border-rule px-2.5 py-1 text-[10px] text-ink/70 hover:bg-panel disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ask a question"
                  className="flex-1 rounded border border-rule px-3 py-2 text-[12.5px] outline-none focus:border-indigo"
                />
                <button onClick={() => send(input)} disabled={busy}
                  className="rounded bg-ink px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-40">
                  Send
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
TW_EOF

wf "components/ConversationList.tsx" <<'TW_EOF'
"use client";

export interface ConversationSummary { id: string; title: string; updatedAt: string }

/**
 * The conversation list.
 *
 * Scoped to one profile: switching profile replaces the list entirely, because
 * every query filters on profileId. There is no authentication in this build,
 * which is recorded as out of scope, so separation is enforced by that filter
 * rather than by a session.
 */
export default function ConversationList({
  conversations, activeId, onOpen, onNew, onDelete, unavailable,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  unavailable?: boolean;
}) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-rule bg-white">
      <div className="border-b border-rule p-2">
        <button
          onClick={onNew}
          className="w-full rounded border border-ink bg-ink px-2 py-1.5 text-[11px] font-medium text-white hover:bg-ink/90"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {unavailable && (
          <p className="px-1 py-6 text-center text-[10px] leading-snug text-ink/40">
            No database connected, so conversations are not saved. The chat still works
            and every figure is unchanged.
          </p>
        )}

        {!unavailable && conversations.length === 0 && (
          <p className="px-1 py-6 text-center text-[10px] leading-snug text-ink/40">
            No conversations yet. Ask something and it will appear here.
          </p>
        )}

        {conversations.map((c) => (
          <div
            key={c.id}
            className={"group mb-1 flex items-center gap-1 rounded px-2 py-1.5 " +
              (c.id === activeId ? "bg-panel" : "hover:bg-panel/60")}
          >
            <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[11px] text-ink">{c.title}</span>
              <span className="block text-[9px] text-ink/40">{when(c.updatedAt)}</span>
            </button>
            <button
              onClick={() => onDelete(c.id)}
              aria-label="Delete conversation"
              className="shrink-0 px-1 text-[11px] text-ink/25 opacity-0 hover:text-red-600 group-hover:opacity-100"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
TW_EOF

wf "components/AnswerDetail.tsx" <<'TW_EOF'
"use client";
import { useState } from "react";
import TraceTree, { type TraceNode } from "./widgets/TraceTree";

export interface Step { stage: string; usedModel: boolean; detail: string; ms: number }
export interface Route { agent: string; usedModel: boolean; reason: string; ms: number }
export interface ResultPayload {
  tool: string; component: string;
  facts: Record<string, number | string>;
  data: unknown; trace: TraceNode | null; durationMs?: number;
}

/**
 * Everything about one answer, in one place.
 *
 * Two questions get answered here, and they are different questions. "How was
 * this answered" is about the machinery: which agent took it, what was called,
 * whether a model was involved at each step, and whether the guard accepted
 * the reply. "The working" is about the arithmetic: which rule produced which
 * figure.
 *
 * It sits under the message rather than inside a result component, so it is
 * available in text mode as well as interactive, and appears exactly once
 * however many tools ran.
 */
export default function AnswerDetail({
  route, steps, results, guard, provider, totalMs,
}: {
  route: Route | null;
  steps: Step[];
  results: ResultPayload[];
  guard: { ok: boolean; offending: string[] } | null;
  provider?: string;
  totalMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const traced = results.filter((r) => r.trace);
  if (!route && steps.length === 0 && traced.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo hover:underline"
      >
        <span>{open ? "\u25BE" : "\u25B8"}</span>
        <span>how this was answered</span>
        {guard && (
          <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
            (guard.ok ? "bg-moss/15 text-moss" : "bg-red-100 text-red-700")}>
            {guard.ok ? "verified" : "corrected"}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-2 rounded border border-rule bg-white p-2.5">
          {route && (
            <Section label="Routing">
              <Line k={route.agent + " agent"} v={`${route.ms}ms`} model={route.usedModel} />
              <p className="mt-0.5 text-[10px] leading-snug text-ink/55">{route.reason}</p>
            </Section>
          )}

          {steps.length > 0 && (
            <Section label="Steps">
              {steps.map((s, i) => (
                <div key={i} className="mb-1">
                  <Line k={s.stage} v={`${s.ms}ms`} model={s.usedModel} />
                  <p className="mt-0.5 text-[10px] leading-snug text-ink/55">{s.detail}</p>
                </div>
              ))}
            </Section>
          )}

          {results.length > 0 && (
            <Section label="Kernel calls">
              {results.map((r, i) => (
                <div key={i} className="flex items-baseline justify-between py-px">
                  <span className="font-mono text-[10px] text-ink/70">{r.tool}</span>
                  <span className="font-mono text-[9px] text-ink/40">
                    {Object.keys(r.facts).length} facts{r.durationMs != null ? ` \u00b7 ${r.durationMs}ms` : ""}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {guard && (
            <div className={"rounded px-2 py-1.5 text-[10px] leading-snug " +
              (guard.ok ? "bg-moss/10 text-moss" : "bg-red-50 text-red-700")}>
              {guard.ok
                ? "Every figure in this answer came from a kernel call. No number was produced by the language model."
                : `The model wrote ${guard.offending.join(", ")}, which no tool produced. That reply was discarded and this one was written from the figures instead.`}
            </div>
          )}

          {traced.length > 0 && (
            <Section label="The working">
              {traced.map((r, i) => <TraceTree key={i} trace={r.trace} />)}
            </Section>
          )}

          {(provider || totalMs != null) && (
            <p className="text-[9px] text-ink/35">
              {provider}{totalMs != null ? ` \u00b7 ${totalMs}ms end to end` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-ink/40">{label}</div>
      {children}
    </div>
  );
}

function Line({ k, v, model }: { k: string; v: string; model: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-ink/80">{k}</span>
      <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
        (model ? "bg-teal/15 text-teal" : "bg-ink/10 text-ink/50")}>
        {model ? "model" : "no model"}
      </span>
      <span className="font-mono text-[9px] text-ink/35">{v}</span>
    </div>
  );
}
TW_EOF

wf "components/widgets/RegimeComparison.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function RegimeComparison({ data }: { data: any; trace?: TraceNode | null }) {
  const win = data.recommended as "new" | "old";
  const side = (id: "new" | "old", r: any) => (
    <div className={`flex-1 rounded border p-2.5 ${win === id ? "border-moss bg-moss/5" : "border-rule bg-white"}`}>
      <div className="flex items-center justify-between">
        <Label>{r.regimeLabel}</Label>
        {win === id && <span className="rounded bg-moss px-1.5 py-px text-[8px] font-bold uppercase text-white">cheaper</span>}
      </div>
      <Big tone={win === id ? "win" : undefined}>{inr(r.totalTax)}</Big>
      <div className="mt-0.5 text-[10px] text-ink/50">taxable {inr(r.taxableIncome)}</div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">{side("new", data.newRegime)}{side("old", data.oldRegime)}</div>
      <Card>
        <div className="text-[11px] leading-snug text-ink/80">
          <span className="font-bold">Difference {inr(data.saving)}.</span> {data.rationale}
        </div>
      </Card>
    </div>
  );
}
TW_EOF

wf "components/widgets/TaxBreakdown.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, Row, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function TaxBreakdown({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>{data.regimeLabel}</Label>
        <Big>{inr(data.totalTax)}</Big>
      </div>

      <table className="mt-2 w-full text-[10.5px]">
        <thead>
          <tr className="text-left text-ink/45">
            <th className="py-1 font-medium">Band</th>
            <th className="py-1 text-right font-medium">Rate</th>
            <th className="py-1 text-right font-medium">Taxed here</th>
            <th className="py-1 text-right font-medium">Tax</th>
          </tr>
        </thead>
        <tbody>
          {data.bands.map((b: any, i: number) => (
            <tr key={i} className={`border-t border-rule ${b.amountInBand > 0 ? "" : "text-ink/30"}`}>
              <td className="py-1 font-mono">{b.to === null ? "above " + inr(b.from) : inr(b.from) + " to " + inr(b.to)}</td>
              <td className="py-1 text-right font-mono">{pct(b.rate)}</td>
              <td className="py-1 text-right font-mono">{inr(b.amountInBand)}</td>
              <td className="py-1 text-right font-mono">{inr(b.taxInBand)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 border-t border-rule pt-1.5">
        <Row k="Taxable income" v={inr(data.taxableIncome)} />
        <Row k="Tax before rebate" v={inr(data.taxBeforeRebate)} />
        {data.rebate87A > 0 && <Row k="Section 87A rebate" v={"-" + inr(data.rebate87A)} />}
        <Row k="Cess at 4%" v={inr(data.cess)} />
        <Row k="Total tax" v={inr(data.totalTax)} strong />
      </div>
    </Card>
  );
}
TW_EOF

wf "components/widgets/PresumptiveComparison.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function PresumptiveComparison({ data }: { data: any; trace?: TraceNode | null }) {
  if (data.applicable === false) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">{data.reason}</p></Card>;
  }
  const win = data.recommended;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {data.options.map((o: any) => {
          const isWin = o.method === win;
          return (
            <div key={o.method} className={`flex-1 rounded border p-2.5 ${isWin ? "border-moss bg-moss/5" : "border-rule bg-white"}`}>
              <div className="flex items-center justify-between">
                <Label>{o.method === "presumptive" ? `Section ${o.scheme}` : "Regular books"}</Label>
                {isWin && <span className="rounded bg-moss px-1.5 py-px text-[8px] font-bold uppercase text-white">lower</span>}
              </div>
              <Big tone={isWin ? "win" : undefined}>{inr(o.declaredProfit)}</Big>
              <div className="mt-0.5 text-[9.5px] leading-tight text-ink/50">{o.basis}</div>
              {!o.eligible && <div className="mt-1 text-[9.5px] text-amber">{o.reason}</div>}
            </div>
          );
        })}
      </div>
      {data.caveats?.length > 0 && (
        <Card tone="warn">
          <Label>Conditions attached</Label>
          <ul className="mt-1 space-y-0.5">
            {data.caveats.map((c: string, i: number) => (
              <li key={i} className="text-[10.5px] leading-snug text-ink/75">{c}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
TW_EOF

wf "components/widgets/SpendingBreakdown.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, Bar, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

const TONES = ["indigo", "teal", "amber", "moss", "indigo", "teal"];

export default function SpendingBreakdown({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Spending</Label>
        <Big>{inr(data.totalSpent)}</Big>
      </div>
      <div className="mt-2 space-y-1.5">
        {data.categories.map((c: any, i: number) => (
          <div key={c.category}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-ink/75">{c.category}</span>
              <span className="font-mono text-[11px]">{inr(c.total)} <span className="text-ink/40">{pct(c.share)}</span></span>
            </div>
            <div className="mt-0.5"><Bar share={c.share} tone={TONES[i % TONES.length]} /></div>
          </div>
        ))}
      </div>
    </Card>
  );
}
TW_EOF

wf "components/widgets/NetWorth.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function NetWorth({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <Label>Net worth</Label>
      <Big>{inr(data.total)}</Big>
      <div className="mt-2 border-t border-rule pt-1.5">
        {data.byAccount.map((a: any, i: number) => (
          <Row key={i} k={`${a.bankName} ${a.maskedNumber} (${a.accountType})`} v={inr(a.balance)} />
        ))}
      </div>
    </Card>
  );
}
TW_EOF

wf "components/widgets/GoalProgress.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Bar, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function GoalProgress({ data }: { data: any; trace?: TraceNode | null }) {
  if (!data.goals?.length) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">No savings goals have been set yet.</p></Card>;
  }
  return (
    <Card>
      <Label>Goals</Label>
      <div className="mt-2 space-y-2.5">
        {data.goals.map((g: any) => (
          <div key={g.name}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-ink">{g.name}</span>
              <span className="font-mono text-[11px]">{inr(g.currentAmount)} <span className="text-ink/40">of {inr(g.targetAmount)}</span></span>
            </div>
            <div className="mt-1"><Bar share={g.progress} tone="moss" /></div>
            <div className="mt-0.5 text-[9.5px] text-ink/50">
              {pct(g.progress)} funded, {inr(g.remaining)} to go
              {g.monthsToTarget !== null ? `, about ${g.monthsToTarget} months at the current savings rate` : ""}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
TW_EOF

wf "components/widgets/GstSummary.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Big, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function GstSummary({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Net GST payable</Label>
        <Big>{inr(data.netGSTPayable)}</Big>
      </div>
      <div className="mt-2 border-t border-rule pt-1.5">
        <Row k="GST charged to customers" v={inr(data.outputGST)} />
        <Row k="Credit for GST paid on expenses" v={"-" + inr(data.inputTaxCredit)} />
        <Row k="Exports (zero-rated)" v={inr(data.exportTurnover)} />
      </div>
      <div className={`mt-2 rounded p-2 text-[10.5px] leading-snug ${data.registrationRequired ? "bg-amber/10 text-amber" : "bg-moss/10 text-moss"}`}>
        {data.registrationRequired
          ? `Turnover is above the ${inr(data.registrationThreshold)} threshold, so registration is required.`
          : `You have ${inr(data.headroomToThreshold)} of turnover left before registration becomes compulsory.`}
      </div>
    </Card>
  );
}
TW_EOF

wf "components/widgets/FactCard.tsx" <<'TW_EOF'
"use client";
import { Card, Label, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

/**
 * The generic renderer.
 *
 * Not every tool result deserves a bespoke component, and inventing one for
 * each would mean twenty half-designed cards rather than eight good ones.
 * This lays out the facts a tool produced, in the order it produced them,
 * with the trace attached. It is plain, and it is never wrong.
 */
const MONEY = /(tax|income|amount|saving|total|worth|gst|credit|payable|profit|receipts|turnover|deduction|exemption|liability|threshold|headroom|rent|tds|shortfall|deducted|spent|received|remaining|target|current)/i;

function humanise(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export default function FactCard({
  title, facts,
}: { title: string; facts: Record<string, number | string>; trace?: TraceNode | null }) {
  const entries = Object.entries(facts);
  if (entries.length === 0) return null;

  return (
    <Card>
      <Label>{title}</Label>
      <div className="mt-1.5">
        {entries.map(([k, v]) => (
          <Row
            key={k}
            k={humanise(k)}
            v={typeof v === "number" && MONEY.test(k) ? inr(v) : String(v)}
          />
        ))}
      </div>
    </Card>
  );
}
TW_EOF

wf "tests/repositories.test.ts" <<'TW_EOF'
import { describe, it, expect } from "vitest";
import { listProfiles, findProfile, source, recordToolCall, readMemory } from "@/lib/db/repositories";
import { hasDatabase } from "@/lib/db/client";
import { allProfiles } from "@/lib/kernel/profiles";

/**
 * These assert the FALLBACK path, which is the one that must never break.
 * They run without a database and without a network.
 */
describe("repositories fall back cleanly with no database", () => {
  it("reports the seed source when DATABASE_URL is absent", async () => {
    if (hasDatabase()) return;                 // skip when a real database is configured
    expect(await source()).toBe("seed");
  });

  it("returns all three fixtures", async () => {
    const p = await listProfiles();
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.id).sort()).toEqual(allProfiles().map((x) => x.id).sort());
  });

  it("finds a profile case-insensitively", async () => {
    expect((await findProfile("priya-001"))?.name).toBe("Priya");
    expect((await findProfile("PRIYA-001"))?.name).toBe("Priya");
  });

  it("returns undefined for an unknown profile rather than throwing", async () => {
    expect(await findProfile("NOBODY-999")).toBeUndefined();
  });

  it("never throws when recording a tool call without a database", async () => {
    await expect(recordToolCall({
      profileId: "PRIYA-001", toolName: "compute_tax",
      args: {}, facts: { totalTax: 0 }, trace: null, durationMs: 3,
    })).resolves.toBeUndefined();
  });

  it("returns null memory rather than throwing", async () => {
    if (hasDatabase()) return;
    expect(await readMemory("PRIYA-001")).toBeNull();
  });
});

describe("conversation titles", () => {
  it("uses a short message unchanged", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    expect(titleFrom("Which regime is better for me?")).toBe("Which regime is better for me?");
  });

  it("truncates a long message at a word boundary", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    const t = titleFrom("I want to understand whether the old regime or the new regime saves me more money this year");
    expect(t.length).toBeLessThanOrEqual(48);
    expect(t.endsWith("...")).toBe(true);
    expect(t).not.toMatch(/\s\.\.\.$/);
  });

  it("collapses whitespace", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    expect(titleFrom("  what   is   80C?  ")).toBe("what is 80C?");
  });
});

describe("conversations degrade without a database", () => {
  it("returns an empty list rather than throwing", async () => {
    const { listConversations } = await import("@/lib/db/repositories");
    expect(await listConversations("PRIYA-001")).toEqual([]);
  });

  it("returns null when creating without a database", async () => {
    const { createConversation } = await import("@/lib/db/repositories");
    expect(await createConversation("PRIYA-001", "hello there")).toBeNull();
  });

  it("never throws when appending a message without a database", async () => {
    const { appendMessage } = await import("@/lib/db/repositories");
    await expect(appendMessage({
      conversationId: "x", profileId: "PRIYA-001", role: "user", content: "hi",
    })).resolves.toBeNull();
  });
});
TW_EOF


echo; say "Installing"
npm install --no-fund --no-audit --loglevel=error
ok "installed"

echo; say "Checks"
if npm test --silent >/tmp/tw10.log 2>&1; then ok "$(grep -oE 'Tests +[0-9]+ passed' /tmp/tw10.log | tail -1)"; else warn "see /tmp/tw10.log"; fi
if npx next build >/tmp/tw10b.log 2>&1; then ok "build passed"; else warn "build failed, see /tmp/tw10b.log"; fi

echo; say "Phase 10 done"; echo
warn "Two new tables. Run this before starting the app:"
note ""
note "    npm run db:push"
note ""
note "It will show the SQL and ask you to confirm. Say yes."
note "Existing profiles, accounts and transactions are untouched."
echo
note "Then:    npm run dev"
echo
note "What changed on screen:"
note "  left pane is now your conversations, with New chat"
note "  switching profile replaces the list entirely"
note "  the task rail is gone; open 'how this was answered' under any reply"
note "  that one panel holds routing, steps, kernel calls, the guard and the working"
echo
note "README.md is now in the project root. Push it to GitHub:"
note "    git add -A && git commit -m 'Phase 10: conversations' && git push"
echo

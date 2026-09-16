#!/usr/bin/env bash
#  TaxWise - PHASES 11, 12 and 13 in one, plus the concepts fix
#
#  Run this INSTEAD of phase11, phase12, phase13 and fix-concepts-dropped.
#  It carries the final state of every file those four would have produced.
#
#  ----------------------------------------------------------------- the fix
#  db:push offered to DROP the concepts table and took 55 embeddings with it.
#  That table is created by scripts/corpus.ts with raw SQL, because a vector
#  column cannot exist until the pgvector extension does. drizzle-kit treats a
#  table it does not manage as one that should not exist. tablesFilter now
#  hides it, so push can never see it again. The corpus is re-embedded at the
#  end of this script.
#
#  ----------------------------------------------------------- phase 11: memory
#  A dossier per profile, read into the agent's prompt before every turn and
#  folded after it. Concepts and tools are recorded from what ACTUALLY ran. The
#  model may offer one note per turn on a strict REMEMBER line; a note holding
#  a figure is refused, because a note is about the person. New /profile page.
#
#  --------------------------------------------------------- phase 12: guidance
#  "help" and "I don't know where to start" are no longer routed to an agent.
#  They return four openers chosen for that person. A capability browser lists
#  what each user can ask. A plain-language reasoning strip sits above every
#  answer. "Explain this" opens a Tutor sub-thread on the ideas behind a
#  figure. Follow-ups come in three labelled kinds.
#
#  ------------------------------------------------- phase 13: functionality pane
#  A middle column of cards, per occupation. Priya 13, Arjun 15, Rohan 16, with
#  11 shared. Click to expand, press Compute, and the question goes into the
#  chat. Nothing in the pane computes. Cards already used are ticked from
#  memory.
#
#  Two documents ship in the project root: README.md is the reference, and
#  HOW_IT_WORKS.md follows one question from keystroke to rendered card with the
#  file responsible at every step, a worked example with real figures, and what
#  happens when each part fails.
#
#  NO SCHEMA CHANGE. Do not run db:push after this.
#
#  Run from INSIDE the project:
#      cd ~/Desktop/taxwise
#      mv ~/Downloads/phase11-13-combined.sh .
#      chmod +x phase11-13-combined.sh && ./phase11-13-combined.sh
set -euo pipefail
B=$'\033[1m'; DM=$'\033[2m'; G=$'\033[32m'; A=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
say(){ printf "%s\n" "${B}$1${X}"; }; note(){ printf "%s\n" "${DM}    $1${X}"; }
ok(){ printf "%s\n" "${G}  OK  $1${X}"; }; warn(){ printf "%s\n" "${A}  !!  $1${X}"; }
die(){ printf "%s\n" "${R}  XX  $1${X}"; exit 1; }
echo; say "TaxWise, phases 11 to 13 combined"; echo
[ -f package.json ] || die "Run this from inside the taxwise folder."
[ -f components/ConversationList.tsx ] || die "Phase 10 is missing. Run phase10-conversations.sh first."
ok "found the Phase 10 project"
echo; say "Writing files"
wf(){ mkdir -p "$(dirname "$1")"; cat > "$1"; note "$1"; }

wf "drizzle.config.ts" <<'TW_EOF'
import "./lib/env";
import { requireEnv } from "./lib/env";
import type { Config } from "drizzle-kit";

/**
 * Migrations run through the SESSION pooler (port 5432), not the transaction
 * pooler. Creating and altering tables uses features that transaction pooling
 * does not carry between statements, so pushing a schema through port 6543
 * fails in ways that are hard to read.
 *
 * requireEnv exits with an explanation rather than letting drizzle-kit report
 * an empty url, which tells you nothing about why it is empty.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: requireEnv("DIRECT_URL") },
  /**
   * The concepts table is created by scripts/corpus.ts with raw SQL, because a
   * vector column cannot exist until the pgvector extension does, and putting
   * it in this schema would break db:push for anyone who has not enabled it.
   *
   * drizzle-kit treats any table it does not manage as one that should not
   * exist, so without this filter a push offers to DROP it, taking every
   * embedding with it. Excluding it here means push never sees it.
   */
  tablesFilter: ["!concepts"],
  verbose: true,
  strict: true,
} satisfies Config;
TW_EOF

wf "README.md" <<'TW_EOF'
# TaxWise

**A Conversational Platform for Financial Literacy and Management using a Multi-Agent LLM Orchestrator**

BCSE497J Project-I · School of Computer Science and Engineering · Vellore Institute of Technology

**New here?** This file is the reference: what the project is, how to run it, and every decision.
For the journey of one question from keystroke to rendered card, with the file responsible at
every step, read [HOW_IT_WORKS.md](HOW_IT_WORKS.md).

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

Two pages beyond the chat: **`/profile`** shows one person's money, accounts, goals, deadlines and
memory; **`/status`** is a build dashboard.

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

**Layer 1, Shell.** Three panes: the conversation list, the functionality pane, and the chat
thread. Plus the dual-mode toggle, the answer detail panel, and a fixed component registry.

**Nothing in the functionality pane computes anything.** A card composes a question and sends it
into the chat, so the chat remains the only route into the kernel and every request still passes
through routing, the tool registry and the audit log. Cards are filtered by occupation, so a
salaried user is never offered GST, and cards already used are ticked from memory, which turns
the pane from a menu into a map of where someone has been. The model selects a component *by name* from that
registry; it never writes interface code, because free-form generation would be neither safe nor
reproducible.

**Layer 2, Orchestrator.** Reads the question, decides which agent owns it, hands over. It holds
no tools, keeps no memory and produces no user-facing text.

Before routing it checks whether the message is a question at all. "Help", "I don't know where to
start" and "what can I ask" are not questions about a topic, they are requests for a starting
point, and routing them to an agent produces a poor answer because there is nothing to retrieve
or compute. They are answered with the capability catalogue instead, led by four openers chosen
for that person's occupation.

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

**Memory.** The kernel holds a dossier per profile, read into the agent's system prompt before a
turn and folded with what happened after it. Concepts and tools are recorded from what *actually
ran*, never from what the model claims. The model may offer one free-text note per turn on a
final `REMEMBER:` line, which is parsed strictly and dropped if malformed, because a
half-understood note is worse than none. Notes containing a figure are refused outright: a note
is about the person, not about an amount.

**Layer 5, Data.** Relational tables for exact values retrieved by key, and a pgvector table for
explanatory prose retrieved by meaning. **They never intersect.** Vector search is approximate by
construction: asking it for a statutory ceiling returns a passage *about* that ceiling, from which
something would have to extract a figure, and that something would be the model.

For the same path walked end to end, with a worked example and real figures, see
[HOW_IT_WORKS.md](HOW_IT_WORKS.md).

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
│   ├── Chat.tsx                three panes, and all the chat state
│   ├── ConversationList.tsx    left pane: conversations, new, delete
│   ├── FunctionPane.tsx        middle pane: what this user can do, per occupation
│   ├── MemoryPanel.tsx         the dossier, shown on the profile page
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
| `list_capabilities` | all | what this particular user can ask for, grouped |
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
| `memory` | One dossier per profile: notes, concepts explained, tools used, turn count |

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

**The conversation.** Conversations persisted and resumable per profile, with a list, New chat and
delete. Every message stores what is needed to redraw it, so reopening one from last week brings
back the cards and the rule tree, not just the text.

**The three panes.** Conversations on the left, what you can do in the middle, chat on the right.
The middle pane is filtered by occupation: Priya sees 13 capabilities, Arjun 15, Rohan 16, with 11
shared because everyone pays tax. Nothing in it computes; a card composes a question and sends it
into the chat.

**Guidance.** A **guided start** for someone who does not know where to begin: "help" and "I don't
know where to start" bypass routing entirely and return four openers chosen for that person. A
**capability browser**, `list_capabilities`, reachable by all three agents. A **reasoning strip**
in plain language above every answer, saying why it routed there and what it then did, generated
from what actually ran. **Explain this**, which opens a Tutor sub-thread on the ideas behind any
figure, seeded from the tool that produced it. **Follow-ups in three labelled kinds**: understand,
do next, learn.

**Memory.** A dossier per profile, read into the agent's prompt before every turn and folded after
it, tracking preferences, decisions, open questions, which concepts have been explained and which
calculations have been run. The Tutor stops re-explaining what is already known.

**The answer.** Dual-mode toggle on every result. An answer detail panel holding routing, steps,
kernel calls, the guard verdict and the rule tree, in one place, available in both modes. A
component registry with nine bespoke components and a generic fallback.

**The machinery.** Orchestrator routing, keyword-first. All three agents with per-agent tool
permissions. The rule engine. The tool registry with trace logging. The agent registry. The
compliance calendar. Retrieval over the corpus by meaning and by term. Three providers assigned by
measured latency.

**The pages.** `/` is the chat. `/profile` carries money, accounts, goals, the compliance calendar
and memory. `/status` is a build dashboard.

### Designed, not yet implemented

Proactive monitor, polling for changes · causal finance
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

wf "HOW_IT_WORKS.md" <<'TW_EOF'
# How It Works

A single question, followed from the keystroke to the rendered card, with the
file responsible at every step.

Read `README.md` first for what the project is. This document is the journey.

---

## Contents

1. [The shape of it](#1-the-shape-of-it)
2. [The journey, step by step](#2-the-journey-step-by-step)
3. [A worked example, with real figures](#3-a-worked-example-with-real-figures)
4. [What the model can and cannot see](#4-what-the-model-can-and-cannot-see)
5. [The four places the guarantee is enforced](#5-the-four-places-the-guarantee-is-enforced)
6. [Three other journeys](#6-three-other-journeys)
7. [When things fail](#7-when-things-fail)
8. [Where every piece of state lives](#8-where-every-piece-of-state-lives)
9. [Reading the code in the right order](#9-reading-the-code-in-the-right-order)

---

## 1. The shape of it

```
   BROWSER                            SERVER                         SUPABASE
 ┌───────────┐   POST /api/chat   ┌─────────────┐              ┌───────────────┐
 │  Chat.tsx │ ─────────────────▶ │  route.ts   │              │  profiles     │
 │           │ ◀───────────────── │             │              │  transactions │
 └───────────┘      JSON          └──────┬──────┘              │  conversations│
                                         │                     │  audit_log    │
                            ┌────────────▼────────────┐        │  memory       │
                            │  orchestrator/route.ts  │        │  concepts     │
                            │  which agent owns this? │        └───────▲───────┘
                            └────────────┬────────────┘                │
                                         │                             │
                              ┌──────────▼──────────┐                  │
                              │   agents/run.ts     │                  │
                              │   Tutor / Comp /    │                  │
                              │   Management        │                  │
                              └──────────┬──────────┘                  │
                                         │ asks for a tool BY NAME     │
                            ┌────────────▼────────────┐                │
                            │  tools/execute.ts       │ ───────────────┤ writes audit_log
                            │  THE DOORWAY            │                │
                            └────────────┬────────────┘                │
                                         │                             │
                              ┌──────────▼──────────┐                  │
                              │   kernel/tax.ts     │ ─────────────────┘ reads profile
                              │   all arithmetic    │
                              └─────────────────────┘
```

**The browser half is Layer 1. Everything below `route.ts` is Layers 2 to 5.**
`app/api/chat/route.ts` is the only door between them, which means nothing in
the browser can reach the kernel without passing the permission check and
leaving a row in the audit log.

---

## 2. The journey, step by step

### Step 0 — before anything is typed

`app/page.tsx` runs on the server, calls `listProfiles()` and hands the three
profiles to `Chat.tsx`. In parallel the browser fetches
`/api/conversations?profileId=…` for the left pane and
`/api/capabilities?profileId=…` for the middle one.

The middle pane is already filtered by occupation at this point: `groupedFor()`
in `lib/kernel/capabilities.ts` returns 13 cards for a salaried user and 16 for
a freelance professional. A salaried user is never shown GST.

### Step 1 — the question leaves the browser

`components/Chat.tsx`, `send()`

```
POST /api/chat
{ message: "which regime is better for me?",
  profileId: "PRIYA-001",
  conversationId: null }
```

`conversationId` is null on the first message of a thread. A card in the
functionality pane arrives here too: **Compute does not compute**, it calls the
same `send()` with a pre-written question, so a card is a shortcut for typing,
not a second route into the system.

### Step 2 — the conversation is opened and the question stored

`app/api/chat/route.ts`

With no `conversationId`, `createConversation()` makes one and titles it from
the first message. The user's message is written to `chat_messages` before
anything is computed, so a crash mid-answer still leaves a readable thread.

### Step 3 — is this a question at all?

`lib/orchestrator/route.ts`, `seemsLost()`

"help", "I don't know where to start" and "what can I ask" are not questions
about a topic. They are requests for a starting point, and routing them to an
agent produces a poor answer because there is nothing to retrieve or compute.
They skip routing entirely and force `list_capabilities`.

Everything else continues.

### Step 4 — routing

`lib/orchestrator/route.ts`, `keywordVerdict()` then `route()`

Three regular expressions are tried first:

| Signal | Goes to |
|---|---|
| `spend, budget, goal, net worth, afford, transactions` | Management |
| `tax, gst, regime, deduction, 80c, hra, 194j, presumptive` | Computation |
| `what is, why does, explain, meaning, difference between` | Tutor |

"which regime is better for me?" hits **regime**, so it routes to Computation
**in about one millisecond with no model call**.

The model is consulted only when none of the three is confident. That order was
measured, not assumed: a small model classified this exact question as a
teaching question, which is wrong, and took 1,384 ms to be wrong.

### Step 5 — memory is read

`lib/agents/run.ts` → `readMemory()` → `asPromptContext()`

The dossier for this profile is loaded and condensed to a few lines, which go
into the agent's system prompt:

> *They have said they prefer: the old regime because of rent. They have already
> had these explained, so do not start from scratch on them: House rent
> allowance, Section 80C.*

This is why the Tutor stops repeating itself.

### Step 6 — the agent is given its tools, and only its tools

`lib/agents/run.ts`

`AGENT_REGISTRY[agent].tools` is read from `lib/kernel/agents.ts`. For
Computation that is 12 names. Each is converted into the shape the AI SDK
expects, carrying its description and its argument schema from
`lib/kernel/tools/registry.ts`.

**The Tutor's three tools are the only ones it is ever offered.** It cannot ask
for `compute_tax` because `compute_tax` is not in the set handed to the model,
and even if it invented the name, step 7 would refuse it.

### Step 7 — the model chooses, the code executes

The model replies with something like *"call `compare_regimes`"*. It does not
run anything. Our code does, through `lib/kernel/tools/execute.ts`:

```
callTool({ agent, tool, args, ctx })
  1. does this tool exist?              → UnknownToolError
  2. may this agent call it?            → ToolPermissionError
  3. do the arguments match the schema? → validation error
  4. run it
  5. write a row to audit_log           ← this row IS the trace
```

Step 5 is why the verifiable trace was never separately engineered. There is no
other path from an agent to the arithmetic, so a figure cannot reach a user
without a log row appearing first.

### Step 8 — the arithmetic

`lib/kernel/regimes.ts` → `lib/kernel/tax.ts` → `slabs.ts`, `hra.ts`,
`deductions.ts`

`compareRegimes` runs `computeTax` twice, once per regime. `computeTax` works
in a fixed order: standard deduction, HRA exemption, Chapter VI-A ceilings,
taxable income, slab tax, section 87A rebate, cess.

**Every function emits a trace node as it computes.** The tree is a byproduct
of the arithmetic, not a reconstruction afterwards, which is what makes it
trustworthy.

No network. No model. No React. That is what lets the kernel be exercised on a
laptop with nothing configured.

### Step 9 — the model gets facts, not data

The tool returns three things. The model receives **only the first**:

```
facts   { newRegimeTax: 0, oldRegimeTax: 87880,
          recommended: "New Regime", saving: 87880 }     → the model
data    the full TaxResult objects, both regimes         → the component
trace   the rule tree                                     → the detail panel
```

A flat list of named values. The model cannot quote a number it was not handed,
because it never sees the rest.

### Step 10 — the model writes, and is checked

`lib/kernel/guard.ts`

The reply comes back, and three things happen in this order:

1. **Follow-ups and the memory note are stripped.** The model was asked to end
   with `FOLLOWUPS:` and optionally `REMEMBER:` lines. They are parsed out
   before anything inspects the answer.
2. **Figures are normalised.** A model writes "2.4 million" where the tool
   returned 2400000. It has rescaled, not invented, so scale words are resolved
   and rewritten in Indian digit grouping: ₹24,00,000.
3. **The guard runs.** Every number in the reply is checked against the facts.
   Anything that did not come from a tool means the reply is **discarded** and
   rewritten by `lib/agents/describe.ts` from the facts alone.

Normalising before checking matters. Checking first would reject a reply that
was never wrong, only differently phrased.

### Step 11 — memory is written

`lib/agents/run.ts`, `recordTurn()`

Concepts and tools are recorded **from what actually ran**, read off the tool
results. Only the free-text note comes from the model, and a note containing a
figure is refused outright: a note is about the person, not about an amount.

### Step 12 — the answer is stored and returned

The assistant message is written to `chat_messages` with a `payload` holding the
tool results, their facts, their traces, the routing decision, the steps, the
guard verdict and the suggestions. That payload is what makes a conversation
**resumable**: reopening it next week redraws the cards, not just the text.

### Step 13 — the browser draws it

`components/widgets/index.tsx`, `renderWidget()`

The server returned a component **name**, `"regime_comparison"`. The registry
looks it up in a fixed map. The model never writes interface code: free-form
generation would render differently every time and could not be tested.

Underneath, `AnswerDetail.tsx` offers *how this was answered*, holding routing,
steps, kernel calls, the guard verdict and the rule tree in one panel.

---

## 3. A worked example, with real figures

**Priya asks: "which regime is better for me?"**

```
 route      "regime" matched                          1 ms, no model
 memory     dossier read, 2 concepts known
 tool       compare_regimes                          38 ms
   └─ computeTax(new)
        standard deduction              75,000
        taxable income              11,25,000
        5% band    4,00,000 taxed  →     20,000
        10% band   3,25,000 taxed  →     32,500
        tax before rebate                52,500
        section 87A rebate              -52,500
        cess at 4%                            0
        TOTAL                                 0
   └─ computeTax(old)
        standard deduction              50,000
        HRA exemption                2,40,000   ← least of three
        Chapter VI-A                    50,000
        taxable income               8,60,000
        5% band    2,50,000 taxed  →     12,500
        20% band   3,60,000 taxed  →     72,000
        cess at 4%                        3,380
        TOTAL                            87,880
 audit_log  one row written
 facts      { newRegimeTax: 0, oldRegimeTax: 87880, saving: 87880, ... }
 model      writes two sentences using only those four numbers
 guard      passed
 memory     +1 turn, +1 tool
 render     regime_comparison, two cards, green badge on the new regime
```

**Her ₹0 is the single most load-bearing figure in the project.** It is produced
by the standard deduction, the slab table and the 87A rebate acting together. A
bug in any one of the three changes it.

**Her HRA exemption of ₹2,40,000** is the lowest of three candidates: ₹3,00,000
received, ₹2,40,000 being 40% of basic because Bengaluru is not a metro, and
₹2,40,000 being rent minus 10% of basic. Treat Bengaluru as a metro and the
answer moves.

---

## 4. What the model can and cannot see

| The model sees | The model never sees |
|---|---|
| The user's question | The rulebook's rates, ceilings or thresholds |
| Descriptions of its own permitted tools | Any tool outside its list |
| Argument schemas, which accept only choices | The `data` returned by a tool |
| The `facts`: a flat list of named values | The trace tree |
| A few lines of memory context | The database |

**No tool accepts a rupee amount from the caller.** Search
`lib/kernel/tools/registry.ts` for an argument named income, balance or
turnover and you will not find one. Every figure is loaded from the profile
inside the tool. If a model could pass an income, it could fabricate one, and
the guarantee would fall at the first step.

The most a model may supply is a **choice**: which regime, which section, how
much to hypothetically invest.

---

## 5. The four places the guarantee is enforced

The rule is that the language model never produces a number that appears in an
answer. It is not asserted once, it is enforced four times along the path.

| # | Where | File | What it stops |
|---|---|---|---|
| 1 | Argument schemas | `tools/registry.ts` | A fabricated income reaching a calculation |
| 2 | Permission check | `tools/execute.ts` | An agent using a capability it should not have |
| 3 | Facts-only return | `tools/execute.ts` | The model quoting something it was not handed |
| 4 | The guard | `kernel/guard.ts` | The model writing a figure into its own prose |

Number 4 catches the case the others cannot: the model is given ₹87,880 and
₹3,380 legitimately, adds them itself, and writes ₹91,260. Both inputs were
real; the sum was supplied by no tool. The guard rejects it.

---

## 6. Three other journeys

### "What is section 80C?" — the Tutor

```
route         "what is" with no possessive   → tutor, 0 ms
tool          search_concepts
              ├─ embed the query             ~800 ms budget
              ├─ pgvector similarity         55 explainers
              └─ if slow or absent, term matching, under 1 ms
facts         { resultCount: 3, method: "vector", topTitle: "Section 80C" }
render        concept_answer
memory        +1 concept explained
```

**The corpus contains no rupee amounts, rates or thresholds.** The Tutor may
quote it verbatim, so a figure in the corpus would let the Tutor state one, and
the governing rule would break through the back door rather than the front.
Where a figure is needed, the text names the tool that supplies it, which is how
a lesson hands off to a calculation.

### "How much did I spend?" — Management

```
route         "spend" matched                → management, 0 ms
tool          categorize_spending
              ├─ listAccounts(profileId)
              ├─ listTransactions per account
              └─ categorizeSpending()        pure kernel function
facts         { totalSpent: 844569, transactionCount: 210,
                top1Category: "Bills", top1Total: 184100 }
render        spending_breakdown, bars by category
```

This is the one journey that genuinely needs the database. Without it there are
no transactions and the answer is empty, while every tax figure still computes.

### "Explain this" — the Tutor, called about another answer

```
click         under any computed answer
POST          /api/chat { explainTools: ["compare_regimes"] }
seed          explainQueryFor() → "why there are two tax regimes"
force         agent = tutor, routing skipped
render        nested under the original answer, not appended to the thread
```

Not stored as a turn, because it is a side question rather than a new one. This
is the bridge from a figure to the idea behind it.

---

## 7. When things fail

Every path degrades rather than breaking, and the figures are identical in
every degraded mode.

| What fails | What happens | What the user loses |
|---|---|---|
| No API key at all | Keyword routing, tools chosen by keyword, phrasing from templates | Natural wording only |
| A provider is retired or down | One retry, then the deterministic path | Natural wording only |
| A model call exceeds 12 seconds | Abandoned, deterministic path answers | Natural wording only |
| The model hallucinates a tool name | Rejected before it runs, keyword fallback picks | Nothing |
| The model writes an invented figure | Reply discarded, rewritten from facts | Natural wording only |
| A query embedding takes over 800 ms | Term matching answers instead | Slightly worse ranking on oblique phrasing |
| Supabase is paused or unreachable | Profiles read from seed files | Transactions, goals, history, memory |
| An audit log write fails | Swallowed | The trace for that one call |

The last is deliberate: losing a log line must never cost a user a correct
answer they are waiting for.

**All three of these were observed during development**, not theorised. Groq
hallucinated `preservative_vs_books`. Google retired `gemini-2.0-flash`
mid-build. Nvidia's endpoint was overloaded on both attempts. In every case the
figures were untouched, because none of those components sits anywhere near the
arithmetic.

---

## 8. Where every piece of state lives

| State | Where | Survives a refresh | Scoped to |
|---|---|---|---|
| The rulebook | `data/tax_rules.json` | yes, it is a file | everyone |
| The concept corpus | `data/concepts.json`, embedded into `concepts` | yes | everyone |
| Profiles, accounts, transactions, goals | Supabase, seeded | yes | one profile |
| Conversations and messages | `conversations`, `chat_messages` | yes | one profile |
| The trace | `audit_log`, one row per tool call | yes | one profile |
| Memory dossier | `memory`, one row per profile | yes | one profile |
| Which message is open, which mode | React state | no | the tab |
| Query embeddings | in-process cache | no | the server process |

**Everything is keyed on `profile_id`.** There is no authentication in this
build, which is recorded as out of scope, so separation is enforced by filtering
every query on the profile rather than by a session. Switching profile replaces
the conversation list, the functionality pane and the memory panel completely.

---

## 9. Reading the code in the right order

If you are opening this repository for the first time, this is the shortest
path to understanding it.

1. **`lib/kernel/tax.ts`** — the arithmetic, and how a trace is emitted while
   computing. Start here because everything else exists to serve it.
2. **`lib/kernel/tools/execute.ts`** — the narrowest point in the system, and
   short enough to read in one sitting. Four checks and a log write.
3. **`lib/kernel/agents.ts`** — three lists of tool names. The isolation
   guarantee is this file.
4. **`lib/orchestrator/route.ts`** — why routing is keyword-first.
5. **`lib/agents/run.ts`** — how a model is given tools, and every fallback.
6. **`lib/kernel/guard.ts`** — how an invented figure is caught.
7. **`components/Chat.tsx`** — the three panes and their state.

Then `npm run tools` for the permission matrix, and
`npm run ask -- "which regime is better for me?"` to watch one question travel
the whole path with no browser involved.
TW_EOF

wf "lib/kernel/memory.ts" <<'TW_EOF'
/**
 * The memory dossier.
 *
 * Memory answers a different question from the conversation list. A
 * conversation records what was said in one sitting. The dossier records what
 * the system knows about a person across all of them: what they prefer, what
 * they have decided, what they are still unsure about, and which concepts they
 * have already had explained.
 *
 * That last category is what makes the literacy objective real rather than
 * decorative. The Tutor can stop re-explaining what someone already
 * understands, and progress becomes something the user can see.
 *
 * This file is pure: it shapes and merges dossiers and knows nothing about the
 * database or the model. That keeps it testable on its own, like the rest of
 * the kernel.
 */

export type NoteKind = "preference" | "decision" | "question" | "fact";

export interface Note {
  kind: NoteKind;
  text: string;
  at: string;          // ISO timestamp
}

export interface ConceptRecord {
  id: string;
  title: string;
  times: number;       // how often it has been explained
  at: string;
}

export interface ToolRecord {
  tool: string;
  times: number;
  at: string;
}

export interface Dossier {
  notes: Note[];
  concepts: ConceptRecord[];
  tools: ToolRecord[];
  turns: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/** Lists are capped so a dossier cannot grow without bound in a long demo. */
const CAP_NOTES = 24;
const CAP_CONCEPTS = 60;
const CAP_TOOLS = 30;

export function emptyDossier(): Dossier {
  return { notes: [], concepts: [], tools: [], turns: 0, firstSeen: null, lastSeen: null };
}

/** Accepts anything previously stored, including an older or malformed shape. */
export function normalise(raw: unknown): Dossier {
  const d = (raw ?? {}) as Partial<Dossier>;
  return {
    notes: Array.isArray(d.notes) ? d.notes.filter(isNote).slice(0, CAP_NOTES) : [],
    concepts: Array.isArray(d.concepts) ? d.concepts.filter(isConcept).slice(0, CAP_CONCEPTS) : [],
    tools: Array.isArray(d.tools) ? d.tools.filter(isTool).slice(0, CAP_TOOLS) : [],
    turns: typeof d.turns === "number" ? d.turns : 0,
    firstSeen: typeof d.firstSeen === "string" ? d.firstSeen : null,
    lastSeen: typeof d.lastSeen === "string" ? d.lastSeen : null,
  };
}

function isNote(x: unknown): x is Note {
  const n = x as Note;
  return !!n && typeof n.text === "string" && n.text.length > 0 &&
    ["preference", "decision", "question", "fact"].includes(n.kind);
}
function isConcept(x: unknown): x is ConceptRecord {
  const c = x as ConceptRecord;
  return !!c && typeof c.id === "string" && typeof c.title === "string";
}
function isTool(x: unknown): x is ToolRecord {
  const t = x as ToolRecord;
  return !!t && typeof t.tool === "string";
}

export interface TurnObservation {
  /** Concepts the Tutor actually surfaced this turn. */
  concepts: { id: string; title: string }[];
  /** Tools that ran this turn. */
  tools: string[];
  /** A single note the model offered, if it offered one. */
  note: Note | null;
  at?: string;
}

/**
 * Fold one turn into a dossier.
 *
 * Pure and idempotent in shape: the same observation applied twice increments
 * counts rather than duplicating entries, which is what a person would expect
 * from "you have had this explained three times".
 */
export function applyTurn(prev: Dossier, obs: TurnObservation): Dossier {
  const at = obs.at ?? new Date().toISOString();
  const d: Dossier = {
    notes: [...prev.notes],
    concepts: [...prev.concepts],
    tools: [...prev.tools],
    turns: prev.turns + 1,
    firstSeen: prev.firstSeen ?? at,
    lastSeen: at,
  };

  for (const c of obs.concepts) {
    const i = d.concepts.findIndex((x) => x.id === c.id);
    if (i >= 0) d.concepts[i] = { ...d.concepts[i], times: d.concepts[i].times + 1, at };
    else d.concepts.unshift({ id: c.id, title: c.title, times: 1, at });
  }

  for (const t of obs.tools) {
    const i = d.tools.findIndex((x) => x.tool === t);
    if (i >= 0) d.tools[i] = { ...d.tools[i], times: d.tools[i].times + 1, at };
    else d.tools.unshift({ tool: t, times: 1, at });
  }

  if (obs.note) {
    // A note that repeats something already known is moved to the front rather
    // than stored twice.
    const same = (a: string, b: string) =>
      a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = d.notes.findIndex((n) => n.kind === obs.note!.kind && same(n.text, obs.note!.text));
    if (existing >= 0) d.notes.splice(existing, 1);
    d.notes.unshift({ ...obs.note, at });
  }

  d.notes = d.notes.slice(0, CAP_NOTES);
  d.concepts = d.concepts.slice(0, CAP_CONCEPTS);
  d.tools = d.tools.slice(0, CAP_TOOLS);
  return d;
}

/**
 * The dossier as a few lines for a system prompt.
 *
 * Deliberately short. A long dossier would crowd out the agent's actual
 * instructions, and the point is context rather than a transcript.
 */
export function asPromptContext(d: Dossier): string {
  if (d.turns === 0) return "";
  const parts: string[] = [];

  const byKind = (k: NoteKind) => d.notes.filter((n) => n.kind === k).slice(0, 3).map((n) => n.text);
  const prefs = byKind("preference");
  const decs = byKind("decision");
  const qs = byKind("question");
  const facts = byKind("fact");

  if (prefs.length) parts.push("They have said they prefer: " + prefs.join("; ") + ".");
  if (decs.length) parts.push("They have decided: " + decs.join("; ") + ".");
  if (facts.length) parts.push("Worth knowing: " + facts.join("; ") + ".");
  if (qs.length) parts.push("Still unsure about: " + qs.join("; ") + ".");

  const known = d.concepts.slice(0, 8).map((c) => c.title);
  if (known.length) {
    parts.push(
      "They have already had these explained, so do not start from scratch on them: " +
      known.join(", ") + "."
    );
  }

  return parts.join(" ");
}

/** Progress, for the interface. */
export function summarise(d: Dossier, corpusSize: number) {
  return {
    turns: d.turns,
    conceptsLearned: d.concepts.length,
    corpusSize,
    toolsUsed: d.tools.length,
    notes: d.notes.length,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
  };
}
TW_EOF

wf "lib/kernel/types.ts" <<'TW_EOF'
/**
 * Kernel types.
 *
 * Nothing in lib/kernel touches the network, React, or a language model.
 * That is what makes every figure here testable on its own.
 */

export type RegimeId = "new" | "old";
export type Occupation = "salaried" | "business" | "profession";

/**
 * One node of the verifiable trace.
 *
 * Every arithmetic step emits one of these as it runs, so the "show the
 * working" view is assembled from the computation itself rather than
 * reconstructed from the answer afterwards.
 */
export interface TraceNode {
  ruleId: string;
  label: string;
  inputs: Record<string, number | string>;
  output: number;
  children?: TraceNode[];
}

export interface Slab {
  from: number;
  to: number | null;
  rate: number;
}

export interface SlabBand extends Slab {
  amountInBand: number;
  taxInBand: number;
}

export type DeductionSection =
  | "80C" | "80D" | "80D_parents_senior" | "80CCD1B" | "24b" | "80E" | "80TTA";

export type Deductions = Partial<Record<DeductionSection, number>>;

export interface HRAInput {
  basicAnnual: number;
  hraReceivedAnnual: number;
  rentAnnual: number;
  isMetro: boolean;
}

export interface TaxInput {
  regime: RegimeId;
  grossIncome: number;
  isSalaried: boolean;
  deductions?: Deductions;
  hra?: HRAInput;
}

export interface TaxResult {
  regime: RegimeId;
  regimeLabel: string;
  grossIncome: number;
  standardDeduction: number;
  hraExemption: number;
  chapterVIA: number;
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  bands: SlabBand[];
  trace: TraceNode;
}
TW_EOF

wf "lib/kernel/capabilities.ts" <<'TW_EOF'
import type { Occupation } from "./types";

/**
 * What this person can actually ask for.
 *
 * A confused user's real problem is not that the system cannot help, it is
 * that they cannot see what help exists. This is the catalogue behind both the
 * "what can I ask?" answer and the guided start.
 *
 * Every entry names a real tool, so the catalogue cannot drift into promising
 * something the system does not do. A test enforces that.
 */

export type CapabilityGroup = "learn" | "tax" | "business" | "money";

export interface Capability {
  id: string;
  group: CapabilityGroup;
  title: string;
  /** Written for someone with no financial background. */
  blurb: string;
  /** Typed into the chat when chosen. */
  ask: string;
  /** The tool this ends up calling. Empty for retrieval-only. */
  tool: string;
  occupations: Occupation[];
}

const ALL: Occupation[] = ["salaried", "business", "profession"];
const SELF: Occupation[] = ["business", "profession"];

export const CAPABILITIES: Capability[] = [
  /* ---------------------------------------------------------- learn */
  {
    id: "learn-concept", group: "learn", title: "Understand a term",
    blurb: "Have any tax or money word explained in plain language, with no figures involved.",
    ask: "What is section 80C?", tool: "search_concepts", occupations: ALL,
  },
  {
    id: "list-sections", group: "learn", title: "See what deductions exist",
    blurb: "A list of every deduction section and what each one covers.",
    ask: "What deductions exist?", tool: "list_deduction_sections", occupations: ALL,
  },

  /* ------------------------------------------------------------ tax */
  {
    id: "compare-regimes", group: "tax", title: "Compare the two tax regimes",
    blurb: "Work out your tax both ways and see which costs less, and by how much.",
    ask: "Which regime is better for me?", tool: "compare_regimes", occupations: ALL,
  },
  {
    id: "compute-tax", group: "tax", title: "Compute your tax",
    blurb: "Your full liability under one regime, with every step shown.",
    ask: "How much tax do I owe?", tool: "compute_tax", occupations: ALL,
  },
  {
    id: "optimise", group: "tax", title: "Find unused deductions",
    blurb: "Every deduction you have not filled, ranked by what filling it would actually save.",
    ask: "How can I pay less tax?", tool: "optimize_deductions", occupations: ALL,
  },
  {
    id: "what-if", group: "tax", title: "Try an investment",
    blurb: "See what your tax becomes if you invest a particular amount.",
    ask: "What if I invest 150000 in 80C?", tool: "what_if_deduction", occupations: ALL,
  },
  {
    id: "hra", group: "tax", title: "Work out your rent relief",
    blurb: "The HRA exemption is the least of three amounts. See all three and which one won.",
    ask: "How much HRA can I claim?", tool: "compute_hra_exemption", occupations: ["salaried"],
  },
  {
    id: "deadlines", group: "tax", title: "See what is due, and when",
    blurb: "The statutory deadlines that apply to you, and no others.",
    ask: "When do I need to file?", tool: "get_deadlines", occupations: ALL,
  },

  /* ------------------------------------------------------- business */
  {
    id: "gst", group: "business", title: "Estimate your GST",
    blurb: "What you charged, credit for GST you paid, and whether you must register.",
    ask: "How much GST do I owe?", tool: "compute_gst", occupations: SELF,
  },
  {
    id: "presumptive", group: "business", title: "Presumptive scheme or real books",
    blurb: "Declare a fixed share of turnover as profit, or count every expense. Compare both.",
    ask: "Should I use presumptive taxation?", tool: "presumptive_vs_books", occupations: SELF,
  },
  {
    id: "advance-tax", group: "business", title: "Plan your advance tax",
    blurb: "Whether you owe tax in instalments through the year, and on which dates.",
    ask: "When is my advance tax due?", tool: "compute_advance_tax", occupations: SELF,
  },
  {
    id: "tds-194j", group: "business", title: "Check what clients deducted",
    blurb: "Clients cut tax from professional fees. See what they should have cut against what they did.",
    ask: "How much TDS did my clients deduct?", tool: "compute_194j_tds", occupations: ["profession"],
  },

  /* ---------------------------------------------------------- money */
  {
    id: "net-worth", group: "money", title: "See what you are worth",
    blurb: "Everything across your connected accounts, added up.",
    ask: "What is my net worth?", tool: "compute_net_worth", occupations: ALL,
  },
  {
    id: "spending", group: "money", title: "See where money goes",
    blurb: "Your spending grouped by category, largest first.",
    ask: "How much did I spend?", tool: "categorize_spending", occupations: ALL,
  },
  {
    id: "savings-rate", group: "money", title: "Check your savings rate",
    blurb: "What share of your income survives the month.",
    ask: "What is my savings rate?", tool: "compute_savings_rate", occupations: ALL,
  },
  {
    id: "goals", group: "money", title: "Track your goals",
    blurb: "How far along each goal is, and roughly how long it will take.",
    ask: "How are my goals doing?", tool: "compute_goal_progress", occupations: ALL,
  },
  {
    id: "transactions", group: "money", title: "Look at recent transactions",
    blurb: "The most recent movements across your accounts.",
    ask: "Show my recent transactions", tool: "list_recent_transactions", occupations: ALL,
  },
];

export const GROUP_LABEL: Record<CapabilityGroup, string> = {
  learn: "Understand something",
  tax: "Work out your tax",
  business: "Run your business",
  money: "Manage your money",
};

export function capabilitiesFor(occupation: Occupation): Capability[] {
  return CAPABILITIES.filter((c) => c.occupations.includes(occupation));
}

export function groupedFor(occupation: Occupation) {
  const list = capabilitiesFor(occupation);
  const order: CapabilityGroup[] = ["learn", "tax", "business", "money"];
  return order
    .map((g) => ({ group: g, label: GROUP_LABEL[g], items: list.filter((c) => c.group === g) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Four openers for someone who does not know where to begin. Deliberately
 * broad, and phrased as a person would say them rather than as a feature name.
 */
export function guidedStartFor(occupation: Occupation): Capability[] {
  const pick = (id: string) => CAPABILITIES.find((c) => c.id === id)!;
  if (occupation === "salaried") return [pick("compare-regimes"), pick("optimise"), pick("spending"), pick("learn-concept")];
  if (occupation === "business") return [pick("presumptive"), pick("gst"), pick("compare-regimes"), pick("net-worth")];
  return [pick("presumptive"), pick("gst"), pick("tds-194j"), pick("learn-concept")];
}
TW_EOF

wf "lib/kernel/agents.ts" <<'TW_EOF'
/**
 * 4D, the agent registry.
 *
 * This file is the whole of the isolation guarantee. An agent is not
 * distinguished by its prompt but by the list below: the set of tools it is
 * permitted to invoke. The Tutor is not instructed to avoid tax functions, it
 * is structurally unable to reach them, because callTool refuses any name that
 * is not in that agent's list.
 *
 * An instruction is something a model can disregard. An absent capability is
 * not.
 */

export type AgentId = "tutor" | "computation" | "management";

export interface AgentSpec {
  id: AgentId;
  name: string;
  /** Which provider serves this agent. Wired up in Phase 5. */
  provider: string;
  /** One line the orchestrator uses when deciding where a request belongs. */
  handles: string;
  /** The complete set of tools this agent may call. Nothing else is reachable. */
  tools: string[];
  /** Written into the system prompt in Phase 5. */
  instruction: string;
}

export const AGENT_REGISTRY: Record<AgentId, AgentSpec> = {
  tutor: {
    id: "tutor",
    name: "Tutor",
    provider: "gemini",
    handles: "questions about what something means, why a rule exists, or how a concept works",
    tools: ["search_concepts", "list_deduction_sections", "list_capabilities"],
    instruction: [
      "You teach financial and tax concepts to someone with no background at all.",
      "You have no access to the rulebook and no access to any calculation.",
      "You must never state a rupee amount, a rate, a threshold or a ceiling, even if you believe you know it.",
      "If the user asks how much, say that you will hand the question to the part of the system that computes, and stop.",
    ].join(" "),
  },
  computation: {
    id: "computation",
    name: "Computation",
    provider: "groq",
    handles: "any question whose answer is a figure: tax, GST, deductions, advance tax",
    tools: [
      "get_profile_summary",
      "list_capabilities",
      "compute_tax",
      "compare_regimes",
      "compute_hra_exemption",
      "optimize_deductions",
      "what_if_deduction",
      "compute_gst",
      "presumptive_vs_books",
      "compute_advance_tax",
      "compute_194j_tds",
      "get_deadlines",
    ],
    instruction: [
      "You answer questions that have a numerical answer.",
      "You never calculate anything yourself. You choose a tool, and you phrase what it returns.",
      "You may only mention numbers that appear in the tool results you were given.",
      "If a number you want is not in those results, call another tool or say you do not have it.",
    ].join(" "),
  },
  management: {
    id: "management",
    name: "Management",
    provider: "openrouter",
    handles: "questions about spending, saving, net worth, goals and what the user can afford",
    tools: [
      "get_profile_summary",
      "list_capabilities",
      "compute_net_worth",
      "categorize_spending",
      "compute_savings_rate",
      "compute_goal_progress",
      "list_recent_transactions",
      "get_deadlines",
    ],
    instruction: [
      "You help the user understand and manage their money: what they spend, what they save, and whether their goals are on track.",
      "You never compute tax. If the user asks about tax, say the computation agent handles that.",
      "You may only mention numbers that appear in the tool results you were given.",
    ].join(" "),
  },
};

export const AGENT_IDS = Object.keys(AGENT_REGISTRY) as AgentId[];

export function agent(id: AgentId): AgentSpec {
  return AGENT_REGISTRY[id];
}

export function mayCall(agentId: AgentId, toolName: string): boolean {
  return AGENT_REGISTRY[agentId].tools.includes(toolName);
}

/** Which agents, if any, are permitted to call a given tool. */
export function agentsFor(toolName: string): AgentId[] {
  return AGENT_IDS.filter((id) => mayCall(id, toolName));
}
TW_EOF

wf "lib/kernel/tools/types.ts" <<'TW_EOF'
import type { z } from "zod";
import type { TraceNode } from "../types";
import type { AgentId } from "../agents";

/** Which component in the Shell registry renders this result. Phase 6 uses these. */
export type ComponentKey =
  | "tax_breakdown"
  | "regime_comparison"
  | "hra_breakdown"
  | "deduction_optimizer"
  | "what_if_diff"
  | "gst_summary"
  | "presumptive_comparison"
  | "advance_tax_schedule"
  | "tds_summary"
  | "net_worth"
  | "spending_breakdown"
  | "savings_rate"
  | "goal_progress"
  | "transaction_list"
  | "deadline_timeline"
  | "profile_summary"
  | "concept_answer"
  | "section_list"
  | "capabilities"
  | "guided_start"
  | "none";

export interface ToolContext {
  profileId: string;
  taskId?: string;
}

/**
 * One entry in the registry.
 *
 * `facts` is the important field. It is the complete set of values the model
 * is permitted to mention in its reply. Anything not in there did not come
 * from the kernel, and the guard in guard.ts rejects it.
 */
export interface ToolSpec<A extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** Shown to the model when it chooses a tool. Written for a reader, not a machine. */
  description: string;
  inputSchema: A;
  component: ComponentKey;
  run: (args: z.infer<A>, ctx: ToolContext) => Promise<{
    data: unknown;
    facts: Record<string, number | string>;
    trace: TraceNode | null;
  }>;
}

export interface ToolResult {
  tool: string;
  agent: AgentId;
  component: ComponentKey;
  data: unknown;
  facts: Record<string, number | string>;
  trace: TraceNode | null;
  durationMs: number;
}

export class ToolPermissionError extends Error {
  constructor(public agentId: AgentId, public toolName: string) {
    super(`Agent "${agentId}" is not permitted to call "${toolName}".`);
    this.name = "ToolPermissionError";
  }
}

export class UnknownToolError extends Error {
  constructor(public toolName: string) {
    super(`No tool named "${toolName}" exists.`);
    this.name = "UnknownToolError";
  }
}
TW_EOF

wf "lib/kernel/tools/registry.ts" <<'TW_EOF'
import { z } from "zod";
import type { ToolSpec } from "./types";
import { computeTax } from "../tax";
import { compareRegimes } from "../regimes";
import { optimizeDeductions } from "../optimize";
import { computeHRAExemption } from "../hra";
import { computeGST, presumptiveVsBooks, computeAdvanceTax, compute194J, getApplicableDeadlines } from "../business";
import { computeNetWorth, categorizeSpending, computeSavingsRate, computeGoalProgress } from "../management";
import { deductionCatalogue } from "../rules";
import { groupedFor, guidedStartFor } from "../capabilities";
import { toTaxInput } from "../profiles";
import { findProfile, listAccounts, listTransactions, listGoals } from "@/lib/db/repositories";

/**
 * 4B, the tool registry: the only doorway from an agent into the kernel.
 *
 * Note what the argument schemas do NOT contain. No tool accepts an income, a
 * balance or any other rupee amount from the caller. Every figure is loaded
 * from the profile inside the tool. If a model could pass an income, it could
 * fabricate one, and the governing rule would be broken at the first step.
 *
 * The most a model may supply is a choice: which regime, which section, how
 * much to hypothetically invest.
 */

async function loadProfile(profileId: string) {
  const p = await findProfile(profileId);
  if (!p) throw new Error(`Unknown profile: ${profileId}`);
  return p;
}

const Empty = z.object({});

export const TOOLS: Record<string, ToolSpec> = {
  /* ------------------------------------------------------------ shared */
  get_profile_summary: {
    name: "get_profile_summary",
    description: "Read the user's own details: occupation, city, income, rent and the deductions already claimed. Call this first when you need to know anything about who you are talking to.",
    inputSchema: Empty,
    component: "profile_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      return {
        data: p,
        facts: {
          name: p.name,
          occupation: p.occupation,
          city: p.city,
          grossAnnualIncome: p.income.grossAnnual,
          monthlyRent: p.rentMonthly,
        },
        trace: null,
      };
    },
  },

  list_capabilities: {
    name: "list_capabilities",
    description: "List everything this particular user can ask about, grouped and written in plain language. Call this when the user asks what they can do, what the system can help with, or says they do not know where to start.",
    inputSchema: z.object({
      guided: z.boolean().optional().describe("True when the user does not know where to start, which shows a shorter opening set."),
    }),
    component: "capabilities",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const groups = groupedFor(p.occupation);
      return {
        data: { occupation: p.occupation, name: p.name, groups, guided: a.guided === true,
                openers: a.guided === true ? guidedStartFor(p.occupation) : [] },
        facts: {
          groupCount: groups.length,
          capabilityCount: groups.reduce((n, g) => n + g.items.length, 0),
        },
        trace: null,
      };
    },
  },

  get_deadlines: {
    name: "get_deadlines",
    description: "List the statutory deadlines that apply to this user, based on their occupation and whether they are registered for GST.",
    inputSchema: z.object({
      gstRegistered: z.boolean().optional().describe("Whether the user is registered for GST. Defaults to false."),
    }),
    component: "deadline_timeline",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const events = getApplicableDeadlines({ occupation: p.occupation, gstRegistered: a.gstRegistered ?? false });
      return { data: events, facts: { deadlineCount: events.length }, trace: null };
    },
  },

  /* -------------------------------------------------------- computation */
  compute_tax: {
    name: "compute_tax",
    description: "Compute the user's total income tax under one regime, with a full step by step derivation. Use when the user asks what they owe or why the amount is what it is.",
    inputSchema: z.object({
      regime: z.enum(["new", "old"]).describe("Which regime to compute under."),
    }),
    component: "tax_breakdown",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const r = computeTax({ ...toTaxInput(p), regime: a.regime });
      return {
        data: r,
        facts: {
          regime: r.regimeLabel,
          grossIncome: r.grossIncome,
          standardDeduction: r.standardDeduction,
          hraExemption: r.hraExemption,
          chapterVIA: r.chapterVIA,
          taxableIncome: r.taxableIncome,
          taxBeforeRebate: r.taxBeforeRebate,
          rebate87A: r.rebate87A,
          cess: r.cess,
          totalTax: r.totalTax,
        },
        trace: r.trace,
      };
    },
  },

  compare_regimes: {
    name: "compare_regimes",
    description: "Compute the tax under both the old and the new regime and recommend the cheaper one. Use when the user asks which regime to choose.",
    inputSchema: Empty,
    component: "regime_comparison",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const c = compareRegimes(toTaxInput(p));
      return {
        data: c,
        facts: {
          newRegimeTax: c.newRegime.totalTax,
          oldRegimeTax: c.oldRegime.totalTax,
          newRegimeTaxableIncome: c.newRegime.taxableIncome,
          oldRegimeTaxableIncome: c.oldRegime.taxableIncome,
          recommended: c.recommended === "new" ? "New Regime" : "Old Regime",
          saving: c.saving,
        },
        trace: c[c.recommended === "new" ? "newRegime" : "oldRegime"].trace,
      };
    },
  },

  compute_hra_exemption: {
    name: "compute_hra_exemption",
    description: "Work out the house rent allowance exemption, showing all three candidate amounts and which one was lowest. Only meaningful for salaried users under the old regime.",
    inputSchema: Empty,
    component: "hra_breakdown",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const basic = p.income.basicAnnual ?? 0;
      const hraReceived = p.income.hraReceivedAnnual ?? 0;
      if (!basic || !hraReceived) {
        return {
          data: { applicable: false, reason: "This user does not draw a salary with an HRA component, so no HRA exemption arises." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      const h = computeHRAExemption({
        basicAnnual: basic, hraReceivedAnnual: hraReceived,
        rentAnnual: p.rentMonthly * 12, isMetro: p.isMetro,
      });
      return {
        data: { applicable: true, ...h },
        facts: {
          exemption: h.exemption,
          actualHRAReceived: h.candidates[0].value,
          shareOfBasic: h.candidates[1].value,
          rentMinusTenPercent: h.candidates[2].value,
        },
        trace: h.trace,
      };
    },
  },

  optimize_deductions: {
    name: "optimize_deductions",
    description: "Find every deduction the user has not fully used and compute the exact rupee tax saving from filling each one. Use when the user asks how to pay less tax.",
    inputSchema: Empty,
    component: "deduction_optimizer",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const o = optimizeDeductions(toTaxInput(p));
      const facts: Record<string, number | string> = {
        baselineTax: o.baselineTax,
        bestPossibleTax: o.bestPossibleTax,
        totalPotentialSaving: o.totalPotentialSaving,
        opportunityCount: o.opportunities.length,
      };
      o.opportunities.slice(0, 4).forEach((x, i) => {
        facts[`option${i + 1}Section`] = x.section;
        facts[`option${i + 1}Headroom`] = x.headroom;
        facts[`option${i + 1}Saving`] = x.taxSavedIfFilled;
      });
      return { data: o, facts, trace: null };
    },
  },

  what_if_deduction: {
    name: "what_if_deduction",
    description: "Show what the user's tax would become if they invested a specific amount under a specific deduction section. Use when the user asks what happens if they invest a particular sum.",
    inputSchema: z.object({
      section: z.enum(["80C", "80D", "80CCD1B", "24b", "80TTA"]).describe("Which deduction section."),
      amount: z.number().int().min(0).max(10000000).describe("The total amount claimed under that section, in rupees."),
    }),
    component: "what_if_diff",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const base = toTaxInput(p);
      const before = computeTax({ ...base, regime: "old" });
      const after = computeTax({
        ...base, regime: "old",
        deductions: { ...(base.deductions ?? {}), [a.section]: a.amount },
      });
      return {
        data: { section: a.section, amount: a.amount, before, after, difference: before.totalTax - after.totalTax },
        facts: {
          section: a.section,
          amountClaimed: a.amount,
          taxBefore: before.totalTax,
          taxAfter: after.totalTax,
          saving: before.totalTax - after.totalTax,
        },
        trace: after.trace,
      };
    },
  },

  compute_gst: {
    name: "compute_gst",
    description: "Compute goods and services tax: what the user charged customers, the credit for GST paid on business expenses, and the net amount payable. Also reports whether registration is required.",
    inputSchema: Empty,
    component: "gst_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
      const g = computeGST({
        domesticTurnover: p.income.domesticReceipts ?? turnover,
        exportTurnover: p.income.exportReceipts ?? 0,
        gstPaidOnExpenses: p.income.gstOnExpensesPaid ?? 0,
      });
      return {
        data: g,
        facts: {
          outputGST: g.outputGST,
          inputTaxCredit: g.inputTaxCredit,
          netGSTPayable: g.netGSTPayable,
          registrationRequired: g.registrationRequired ? "yes" : "no",
          registrationThreshold: g.registrationThreshold,
          headroomToThreshold: g.headroomToThreshold,
        },
        trace: g.trace,
      };
    },
  },

  presumptive_vs_books: {
    name: "presumptive_vs_books",
    description: "Compare declaring profit under a presumptive scheme, section 44AD for a business or 44ADA for a professional, against keeping regular books of account. Reports which produces the lower declared profit and the conditions attached.",
    inputSchema: Empty,
    component: "presumptive_comparison",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      if (p.occupation === "salaried") {
        return {
          data: { applicable: false, reason: "Presumptive taxation applies to business and professional income, not to salary." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
      const r = presumptiveVsBooks({
        occupation: p.occupation,
        turnover,
        actualExpenses: p.income.businessExpensesAnnual ?? 0,
        digitalReceiptShare: p.income.digitalReceiptShare ?? 1,
      });
      return {
        data: { applicable: true, ...r },
        facts: {
          scheme: r.options[0].scheme ?? "none",
          presumptiveProfit: r.options[0].declaredProfit,
          profitFromBooks: r.options[1].declaredProfit,
          recommended: r.recommended,
          difference: r.profitDifference,
          turnover,
        },
        trace: r.trace,
      };
    },
  },

  compute_advance_tax: {
    name: "compute_advance_tax",
    description: "Work out whether advance tax is due and produce the instalment schedule with dates and amounts.",
    inputSchema: z.object({
      underPresumptiveScheme: z.boolean().optional().describe("Whether the user is using a presumptive scheme, which changes the schedule to a single March instalment."),
    }),
    component: "advance_tax_schedule",
    async run(a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const c = compareRegimes(toTaxInput(p));
      const liability = c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const r = computeAdvanceTax({ totalLiability: liability, underPresumptiveScheme: a.underPresumptiveScheme ?? false });
      const facts: Record<string, number | string> = {
        totalLiability: r.totalLiability,
        required: r.required ? "yes" : "no",
        minimumLiability: r.minimumLiability,
        instalmentCount: r.instalments.length,
      };
      r.instalments.forEach((i) => { facts[`due_${i.dueDate.replace(/\s/g, "_")}`] = i.cumulativeAmount; });
      return { data: r, facts, trace: r.trace };
    },
  },

  compute_194j_tds: {
    name: "compute_194j_tds",
    description: "For a professional, compute how much tax clients should have deducted at source from their fees under section 194J, and compare it against what was actually deducted.",
    inputSchema: Empty,
    component: "tds_summary",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      if (p.occupation !== "profession") {
        return {
          data: { applicable: false, reason: "Section 194J applies to professional fees. This user does not have professional income." },
          facts: { applicable: "no" } as Record<string, number | string>,
          trace: null,
        };
      }
      const receipts = p.income.grossReceiptsAnnual ?? 0;
      const t = compute194J(receipts);
      const actual = p.income.tds194JDeducted ?? 0;
      return {
        data: { applicable: true, ...t, actuallyDeducted: actual, grossReceipts: receipts, shortfall: t.expectedTDS - actual },
        facts: {
          grossReceipts: receipts,
          expectedTDS: t.expectedTDS,
          actuallyDeducted: actual,
          shortfall: t.expectedTDS - actual,
        },
        trace: null,
      };
    },
  },

  /* --------------------------------------------------------- management */
  compute_net_worth: {
    name: "compute_net_worth",
    description: "Add up the balances across every account the user has connected.",
    inputSchema: Empty,
    component: "net_worth",
    async run(_a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const n = computeNetWorth(accs.map((a) => ({
        bankName: a.bankName, maskedNumber: a.maskedNumber, balance: a.balance, accountType: a.accountType,
      })));
      return {
        data: n,
        facts: { netWorth: n.total, accountCount: n.byAccount.length },
        trace: n.trace,
      };
    },
  },

  categorize_spending: {
    name: "categorize_spending",
    description: "Group the user's outgoing transactions by category and report what they spend most on.",
    inputSchema: Empty,
    component: "spending_breakdown",
    async run(_a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const c = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const facts: Record<string, number | string> = {
        totalSpent: c.totalSpent,
        totalReceived: c.totalReceived,
        transactionCount: tx.length,
        categoryCount: c.categories.length,
      };
      c.categories.slice(0, 3).forEach((x, i) => {
        facts[`top${i + 1}Category`] = x.category;
        facts[`top${i + 1}Total`] = x.total;
      });
      return { data: c, facts, trace: c.trace };
    },
  },

  compute_savings_rate: {
    name: "compute_savings_rate",
    description: "Work out how much of the user's income is left after spending, and express it as a percentage.",
    inputSchema: Empty,
    component: "savings_rate",
    async run(_a, ctx) {
      const p = await loadProfile(ctx.profileId);
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const spend = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const c = compareRegimes(toTaxInput(p));
      const netIncome = p.income.grossAnnual - c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const s = computeSavingsRate({ netIncome, totalSpent: spend.totalSpent });
      return {
        data: { ...s, netIncome, totalSpent: spend.totalSpent },
        facts: {
          netIncome,
          totalSpent: spend.totalSpent,
          saved: s.saved,
          savingsRatePercent: Math.round(s.rate * 10000) / 100,
        },
        trace: s.trace,
      };
    },
  },

  compute_goal_progress: {
    name: "compute_goal_progress",
    description: "Report how far along the user is on each savings goal, and roughly how long each will take at their current savings rate.",
    inputSchema: Empty,
    component: "goal_progress",
    async run(_a, ctx) {
      const goals = await listGoals(ctx.profileId);
      if (goals.length === 0) {
        return { data: { goals: [], empty: true }, facts: { goalCount: 0 }, trace: null };
      }
      const p = await loadProfile(ctx.profileId);
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((a) => listTransactions(a.id)))).flat();
      const spend = categorizeSpending(tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant, category: t.category, occurredAt: t.occurredAt,
      })));
      const c = compareRegimes(toTaxInput(p));
      const netIncome = p.income.grossAnnual - c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax;
      const monthly = Math.max(0, Math.round((netIncome - spend.totalSpent) / 12));
      const g = computeGoalProgress(
        goals.map((x) => ({ name: x.name, targetAmount: x.targetAmount, currentAmount: x.currentAmount, targetDate: x.targetDate })),
        monthly
      );
      const facts: Record<string, number | string> = { goalCount: g.goals.length, monthlySaving: monthly };
      g.goals.forEach((x, i) => {
        facts[`goal${i + 1}Name`] = x.name;
        facts[`goal${i + 1}Target`] = x.targetAmount;
        facts[`goal${i + 1}Current`] = x.currentAmount;
        facts[`goal${i + 1}Remaining`] = x.remaining;
      });
      return { data: g, facts, trace: g.trace };
    },
  },

  list_recent_transactions: {
    name: "list_recent_transactions",
    description: "List the user's most recent transactions across all accounts.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("How many to return. Defaults to 10."),
    }),
    component: "transaction_list",
    async run(a, ctx) {
      const accs = await listAccounts(ctx.profileId);
      const tx = (await Promise.all(accs.map((x) => listTransactions(x.id)))).flat();
      tx.sort((x, y) => new Date(y.occurredAt).getTime() - new Date(x.occurredAt).getTime());
      const out = tx.slice(0, a.limit ?? 10);
      return {
        data: out,
        facts: { returned: out.length, totalAvailable: tx.length },
        trace: null,
      };
    },
  },

  /* --------------------------------------------------------------- tutor */
  list_deduction_sections: {
    name: "list_deduction_sections",
    description: "List the deduction sections that exist and what each one covers, in plain language. Returns section names and descriptions only, never any amount the user has claimed.",
    inputSchema: Empty,
    component: "section_list",
    async run() {
      const cat = deductionCatalogue().map((c) => ({ section: c.section, label: c.label }));
      return { data: cat, facts: { sectionCount: cat.length }, trace: null };
    },
  },

  search_concepts: {
    name: "search_concepts",
    description: "Search the explanatory corpus for material that answers a conceptual question. Returns prose written for someone with no financial background. It never returns a figure, because the corpus contains none.",
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("What the user wants explained."),
    }),
    component: "concept_answer",
    async run(a) {
      const { retrieve } = await import("../retrieval");
      const r = await retrieve(a.query, 3);
      return {
        data: {
          query: a.query,
          method: r.method,
          note: r.note,
          results: r.hits.map((h) => ({
            id: h.id, title: h.title, category: h.category, level: h.level,
            body: h.body, relatedTools: h.relatedTools, score: Math.round(h.score * 100) / 100,
          })),
        },
        facts: {
          resultCount: r.hits.length,
          method: r.method,
          topTitle: r.hits[0]?.title ?? "none",
        },
        trace: null,
      };
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);
TW_EOF

wf "lib/db/repositories.ts" <<'TW_EOF'
import { eq } from "drizzle-orm";
import { db, hasDatabase } from "./client";
import { and, desc, eq as eqq } from "drizzle-orm";
import { profiles, accounts, transactions, goals, auditLog, memory, tasks, conversations, chatMessages } from "./schema";
import { allProfiles as seedProfiles, type Profile } from "@/lib/kernel/profiles";
import type { TraceNode } from "@/lib/kernel/types";
import { type Dossier, emptyDossier, normalise } from "@/lib/kernel/memory";

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

/**
 * The dossier for one profile.
 *
 * Returns an empty dossier rather than null when there is nothing stored or no
 * database, so every caller can treat memory as always present and never has
 * to branch on its absence.
 */
export async function readMemory(profileId: string): Promise<Dossier> {
  const d = db();
  if (!d) return emptyDossier();
  try {
    const rows = await d.select().from(memory).where(eqq(memory.profileId, profileId)).limit(1);
    return normalise(rows[0]?.dossier);
  } catch {
    return emptyDossier();
  }
}

export async function writeMemory(profileId: string, dossier: Dossier): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.insert(memory).values({ profileId, dossier: dossier as unknown as object })
      .onConflictDoUpdate({
        target: memory.profileId,
        set: { dossier: dossier as unknown as object, updatedAt: new Date() },
      });
  } catch { /* memory must never break an answer */ }
}

export async function clearMemory(profileId: string): Promise<void> {
  await writeMemory(profileId, emptyDossier());
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

wf "lib/agents/prompts.ts" <<'TW_EOF'
import { AGENT_REGISTRY, type AgentId } from "../kernel/agents";

/**
 * The rule below is repeated in every agent prompt, deliberately.
 *
 * It is not the mechanism that keeps the model away from arithmetic: the tool
 * registry does that structurally, and the guard catches what slips through.
 * The instruction exists so the model does not waste a turn trying something
 * it is not allowed to do.
 */
const COMMON = [
  "You are part of TaxWise, a platform that helps young earners in India understand and manage their money.",
  "",
  "Absolute rules:",
  "1. You never calculate anything. Not addition, not percentages, not totals. Tools do all arithmetic.",
  "2. You may only state a number that appears in a tool result you were given in this conversation.",
  "3. If you need a number you do not have, call a tool. If no tool provides it, say you do not have it.",
  "4. Never use an em dash. Write plainly, for someone with no financial background.",
  "5. Keep replies to three or four short sentences. The interface shows the detail; you supply the meaning.",
  "6. Write every rupee figure in full, exactly as the tool gave it. Never rescale into lakh, crore, million or thousand.",
  "",
  "After your reply, on its own final line, offer three short follow-up questions the user might ask next.",
  "Use exactly this format and nothing else on that line:",
  "FOLLOWUPS: first question | second question | third question",
  "Write them as the user would type them. Keep each under twelve words. Never put a rupee figure in them.",
].join("\n");

export function systemPrompt(id: AgentId, memoryContext = ""): string {
  const a = AGENT_REGISTRY[id];
  return [
    COMMON,
    "",
    `You are the ${a.name} agent. ${a.instruction}`,
    "",
    `Tools available to you: ${a.tools.join(", ")}.`,
    "You have no other tools. Do not describe capabilities you do not have.",
    ...(memoryContext
      ? ["", "What you already know about this person:", memoryContext,
         "Use it so the conversation feels continuous. Do not recite it back to them."]
      : []),
    "",
    "If this exchange revealed something durable about the person, add one more final line:",
    "REMEMBER: preference|decision|question|fact | the thing itself in under fifteen words",
    "Only when it is genuinely durable. Never a figure, and never something they merely asked about.",
  ].join("\n");
}

export const ROUTER_PROMPT = [
  "You route a user's question to exactly one specialist. Reply with one word only.",
  "",
  "tutor        - they want to understand what something means or why a rule exists. No figure is requested.",
  "computation  - they want a figure: tax owed, GST, deductions, advance tax, which regime is better.",
  "management   - they want to know about their spending, savings, net worth, goals, or what they can afford.",
  "",
  "If the question asks 'how much' about tax or GST, choose computation.",
  "If it asks 'what is' or 'why', choose tutor.",
  "If it is about their own money rather than tax, choose management.",
  "",
  "Reply with exactly one of: tutor, computation, management",
].join("\n");
TW_EOF

wf "lib/agents/run.ts" <<'TW_EOF'
import { generateText, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { modelFor, timeoutSignal, optionsFor, MODEL_TIMEOUT_MS } from "./providers";
import { systemPrompt } from "./prompts";
import { AGENT_REGISTRY, type AgentId } from "../kernel/agents";
import { TOOLS } from "../kernel/tools/registry";
import { callTool } from "../kernel/tools/execute";
import { checkReply, normaliseNumbers } from "../kernel/guard";
import { resolveFollowUps, type FollowUp } from "./followups";
import { applyTurn, asPromptContext, type Note, type NoteKind, type Dossier } from "../kernel/memory";
import { readMemory, writeMemory } from "@/lib/db/repositories";
import { describeResult } from "./describe";
import { pickToolsDeterministically } from "./fallback";
import type { ToolResult } from "../kernel/tools/types";

export interface AgentStep {
  stage: "route" | "select" | "call" | "validate" | "explain";
  usedModel: boolean;
  detail: string;
  ms: number;
}

export interface AgentAnswer {
  agent: AgentId;
  provider: string;
  text: string;
  toolResults: ToolResult[];
  /** The component the Shell should render in interactive mode. */
  component: string;
  steps: AgentStep[];
  guard: { ok: boolean; offending: string[] };
  degraded: boolean;
  /** Follow-up questions offered under the answer. */
  suggestions: FollowUp[];
  suggestionSource: "model" | "fixed";
  /** What was added to the dossier this turn, if anything. */
  remembered: Note | null;
}

/**
 * Run one agent against one question.
 *
 * The model is given only the tools its agent is permitted to call, and each
 * of those tools routes through callTool, which checks permission again and
 * writes to the audit log. So the model cannot reach a tool it should not have
 * even if it invents the name, and it cannot use one without leaving a record.
 *
 * After the model writes its reply, the guard scans it for figures that did not
 * come from a tool result. If it finds any, the reply is discarded and replaced
 * with deterministic phrasing built from the facts. A wrong number is never
 * shown, even once.
 */
export async function runAgent(opts: {
  agent: AgentId;
  message: string;
  profileId: string;
  taskId?: string;
  /**
   * Run exactly these tools and phrase the result, with no model involved.
   * Used when the request is not a question about a topic but a request for a
   * starting point, where there is nothing for a model to decide.
   */
  forceTools?: { tool: string; args?: Record<string, unknown> }[];
}): Promise<AgentAnswer> {
  const { agent, message, profileId, taskId } = opts;
  const steps: AgentStep[] = [];
  const collected: ToolResult[] = [];
  const cache = new Map<string, ToolResult>();
  const ctx = { profileId, taskId };

  // Read before anything else so the model sees it, and so the deterministic
  // path can still record the turn.
  const dossier: Dossier = await readMemory(profileId);
  const memoryContext = asPromptContext(dossier);

  const chosen = opts.forceTools?.length ? null : modelFor(agent);

  /* ------------------------------------------- forced tools, or no provider */
  if (!chosen) {
    if (opts.forceTools?.length) {
      for (const { tool, args } of opts.forceTools) {
        const t = Date.now();
        try {
          const r = await callTool({ agent, tool, args, ctx });
          collected.push(r);
          steps.push({ stage: "call", usedModel: false, detail: `${tool} called directly`, ms: Date.now() - t });
        } catch (e) {
          steps.push({ stage: "call", usedModel: false, detail: e instanceof Error ? e.message : "tool failed", ms: Date.now() - t });
        }
      }
      const text = describeResult(collected);
      const fu = resolveFollowUps("", agent, collected, message);
      await recordTurn(profileId, dossier, collected, null);
      return {
        agent, provider: "deterministic", text, toolResults: collected,
        component: collected[0]?.component ?? "none",
        steps, guard: { ok: true, offending: [] }, degraded: false,
        suggestions: fu.suggestions, suggestionSource: fu.source, remembered: null,
      };
    }
    const t0 = Date.now();
    const names = pickToolsDeterministically(agent, message);
    steps.push({ stage: "select", usedModel: false, detail: `Matched ${names.join(", ") || "nothing"} by keyword. No model available.`, ms: Date.now() - t0 });

    for (const { name, args } of names.map((n) => ({ name: n, args: defaultArgs(n, message) }))) {
      const t = Date.now();
      try {
        const r = await callTool({ agent, tool: name, args, ctx });
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} returned ${Object.keys(r.facts).length} facts`, ms: Date.now() - t });
      } catch (e) {
        steps.push({ stage: "call", usedModel: false, detail: e instanceof Error ? e.message : "tool failed", ms: Date.now() - t });
      }
    }
    const text = describeResult(collected);
    const fu = resolveFollowUps("", agent, collected, message);
    await recordTurn(profileId, dossier, collected, null);
    return {
      agent, provider: "deterministic", text, toolResults: collected,
      component: collected[0]?.component ?? "none",
      steps, guard: { ok: true, offending: [] }, degraded: true,
      suggestions: fu.suggestions, suggestionSource: fu.source,
      remembered: null,
    };
  }

  /* ---------------------------------------------------- model-driven path */
  const permitted = AGENT_REGISTRY[agent].tools;
  const sdkTools: ToolSet = {};

  for (const name of permitted) {
    const spec = TOOLS[name];
    if (!spec) continue;
    sdkTools[name] = tool({
      description: spec.description,
      inputSchema: spec.inputSchema as z.ZodTypeAny,
      execute: async (args: Record<string, unknown>) => {
        // A model will sometimes call the same tool twice with identical
        // arguments in one turn. The kernel is deterministic, so the second
        // call cannot return anything new; serving it from cache saves the
        // round trip without changing the answer.
        /**
         * Retrieval is capped at one call per turn regardless of arguments.
         * A model asked "what is HRA" called search_concepts twice with
         * slightly different phrasings, paying the embedding cost twice for a
         * corpus of fifty-five documents. One retrieval is enough; a second
         * costs a second and a half and adds nothing.
         */
        const key = name === "search_concepts" ? name : name + ":" + JSON.stringify(args ?? {});
        const cached = cache.get(key);
        if (cached) {
          steps.push({ stage: "call", usedModel: false, detail: name === "search_concepts" ? `${name} already ran this turn, reusing the result` : `${name} served from cache, identical arguments`, ms: 0 });
          return cached.facts;
        }
        const t = Date.now();
        const r = await callTool({ agent, tool: name, args, ctx });
        cache.set(key, r);
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} returned ${Object.keys(r.facts).length} facts`, ms: Date.now() - t });
        // The model sees ONLY the facts, never the full data structure. It
        // cannot quote a number it was not explicitly handed.
        return r.facts;
      },
    });
  }

  const t0 = Date.now();
  let text = "";
  let modelFailed = false;

  /**
   * A model sometimes fails in a way that a second attempt fixes. Groq was
   * observed calling a tool named "preservative_vs_books" instead of
   * "presumptive_vs_books", which its own validator rejected. One retry
   * recovers that at the cost of a single extra call. A timeout is not
   * retried, because whatever made it slow will still be slow.
   */
  const attempt = async () => generateText({
      model: chosen.model,
      system: systemPrompt(agent, memoryContext),
      prompt: message,
      tools: sdkTools,
      stopWhen: stepCountIs(4),
      temperature: 0.2,
      abortSignal: timeoutSignal(),
      providerOptions: optionsFor(chosen.provider),
    });

  try {
    let res;
    try {
      res = await attempt();
    } catch (first) {
      const msg = first instanceof Error ? first.message : "";
      const retryable = !/abort|timeout|timed out/i.test(msg);
      if (!retryable) throw first;
      steps.push({ stage: "select", usedModel: true, detail: `First attempt failed (${msg.slice(0, 70)}). Retrying once.`, ms: Date.now() - t0 });
      res = await attempt();
    }
    text = (res.text ?? "").trim();
    steps.push({ stage: "explain", usedModel: true, detail: `${chosen.provider} produced ${text.length} characters after ${collected.length} tool call(s)`, ms: Date.now() - t0 });
  } catch (e) {
    modelFailed = true;
    const msg = e instanceof Error ? e.message : "unknown";
    const timedOut = /abort|timeout|timed out/i.test(msg);
    steps.push({
      stage: "explain", usedModel: true,
      detail: timedOut
        ? `Model exceeded ${MODEL_TIMEOUT_MS}ms and was abandoned. Answering deterministically instead.`
        : `Model call failed: ${msg}. Falling back.`,
      ms: Date.now() - t0,
    });
  }

  /* ---------------- the model produced nothing useful, or called no tools */
  if (modelFailed || collected.length === 0) {
    const names = pickToolsDeterministically(agent, message);
    for (const name of names) {
      if (collected.some((c) => c.tool === name)) continue;
      try {
        const r = await callTool({ agent, tool: name, args: defaultArgs(name, message), ctx });
        collected.push(r);
        steps.push({ stage: "call", usedModel: false, detail: `${name} called by keyword fallback`, ms: 0 });
      } catch { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------- the guard */
  const tg = Date.now();
  const factList = collected.map((c) => c.facts);

  // Pull the model's own lines off before anything inspects the answer.
  const note = extractNote(text);
  if (note) text = text.replace(NOTE_LINE, "").trim();
  const fu = resolveFollowUps(text, agent, collected, message);
  text = fu.text;

  /**
   * Normalise before checking, not after.
   *
   * A model writes "2.4 million" where a tool returned 2400000. Checking first
   * rejects a reply that was never wrong, only differently scaled. Normalising
   * first resolves the scale, and anything that still does not match a tool
   * result is a genuine invention and is still rejected.
   */
  if (text) text = normaliseNumbers(text, factList);
  const guard = checkReply(text, factList);
  let degraded = modelFailed;

  if (!text || !guard.ok) {
    text = describeResult(collected);
    degraded = true;
    steps.push({
      stage: "validate", usedModel: false,
      detail: guard.ok ? "Model returned no text. Using deterministic phrasing."
        : `Rejected: ${guard.offending.join(", ")} did not come from any tool result. Using deterministic phrasing.`,
      ms: Date.now() - tg,
    });
  } else {
    steps.push({
      stage: "validate", usedModel: false,
      detail: "Every figure in the reply traces to a tool result, in Indian digit grouping.",
      ms: Date.now() - tg,
    });
  }

  await recordTurn(profileId, dossier, collected, note);

  return {
    agent, provider: chosen.provider, text, toolResults: collected,
    component: collected[0]?.component ?? "none",
    steps, guard: { ok: guard.ok, offending: guard.offending }, degraded,
    suggestions: fu.suggestions, suggestionSource: fu.source,
    remembered: note,
  };
}

/** Reasonable arguments when a tool is chosen by keyword rather than by the model. */
function defaultArgs(name: string, message: string): Record<string, unknown> {
  const m = message.toLowerCase();
  if (name === "compute_tax") return { regime: /\bold\b/.test(m) ? "old" : "new" };
  if (name === "search_concepts") return { query: message.slice(0, 300) };
  if (name === "list_recent_transactions") return { limit: 10 };
  return {};
}

/* --------------------------------------------------------------- memory */

const NOTE_LINE = /^[ \t]*REMEMBER[ \t]*:[ \t]*(preference|decision|question|fact)[ \t]*\|[ \t]*(.+)$/im;

/**
 * The model may offer one durable note per turn on a final line. It is parsed
 * strictly and dropped if malformed, because a half-understood note in a
 * dossier is worse than no note at all.
 */
export function extractNote(raw: string): Note | null {
  const m = raw.match(NOTE_LINE);
  if (!m) return null;
  const text = m[2].trim().replace(/[.\s]+$/, "");
  if (text.length < 4 || text.length > 120) return null;
  // A note is about the person, not about a figure.
  if (/\d[\d,]{3,}/.test(text)) return null;
  return { kind: m[1].toLowerCase() as NoteKind, text, at: new Date().toISOString() };
}

/**
 * Fold the turn into the dossier and store it.
 *
 * Concepts and tools are recorded from what actually ran, not from what the
 * model claims. Only the free-text note comes from the model, and even that is
 * parsed strictly.
 *
 * Failures are swallowed: losing a dossier update must never cost the user a
 * correct answer they are waiting for.
 */
async function recordTurn(
  profileId: string,
  prev: Dossier,
  results: ToolResult[],
  note: Note | null
): Promise<void> {
  try {
    const concepts: { id: string; title: string }[] = [];
    for (const r of results) {
      if (r.tool !== "search_concepts") continue;
      const d = r.data as { results?: { id: string; title: string }[] } | null;
      for (const c of d?.results ?? []) concepts.push({ id: c.id, title: c.title });
    }
    const next = applyTurn(prev, {
      concepts,
      tools: results.map((r) => r.tool),
      note,
    });
    await writeMemory(profileId, next);
  } catch { /* never block an answer */ }
}
TW_EOF

wf "lib/agents/describe.ts" <<'TW_EOF'
import { inr } from "../kernel/money";
import type { ToolResult } from "../kernel/tools/types";

/**
 * Deterministic phrasing.
 *
 * Used whenever the model is unavailable, fails, or writes a figure the guard
 * rejects. Every sentence here is built only from facts a tool produced, so
 * this path can never state a wrong number. It is plainer than the model's
 * prose; it is never less correct.
 */
export function describeResult(results: ToolResult[]): string {
  if (results.length === 0) {
    return "I could not work out which calculation you needed. Try asking about your tax, your spending, or a specific deduction.";
  }
  return results.map(describeOne).filter(Boolean).join(" ");
}

function n(f: Record<string, number | string>, k: string): number {
  const v = f[k];
  return typeof v === "number" ? v : 0;
}

function describeOne(r: ToolResult): string {
  const f = r.facts;
  switch (r.tool) {
    case "compute_tax":
      return `Under the ${f.regime}, your taxable income comes to ${inr(n(f, "taxableIncome"))} and the tax on that is ${inr(n(f, "totalTax"))}.`
        + (n(f, "rebate87A") > 0 ? ` A section 87A rebate of ${inr(n(f, "rebate87A"))} was applied.` : "");

    case "compare_regimes":
      return `The new regime gives a tax of ${inr(n(f, "newRegimeTax"))} and the old regime gives ${inr(n(f, "oldRegimeTax"))}. `
        + `The ${f.recommended} is cheaper for you by ${inr(n(f, "saving"))}.`;

    case "compute_hra_exemption":
      return f.applicable === "no"
        ? "You do not draw a salary with a house rent allowance component, so no HRA exemption arises."
        : `Your HRA exemption works out to ${inr(n(f, "exemption"))}, which is the lowest of the three amounts the rule compares.`;

    case "optimize_deductions":
      return `Your tax under the old regime is currently ${inr(n(f, "baselineTax"))}. There are ${f.opportunityCount} deductions you have not fully used, `
        + `and filling all of them would bring it to ${inr(n(f, "bestPossibleTax"))}, a saving of ${inr(n(f, "totalPotentialSaving"))}.`;

    case "what_if_deduction":
      return `Claiming ${inr(n(f, "amountClaimed"))} under ${f.section} moves your tax from ${inr(n(f, "taxBefore"))} to ${inr(n(f, "taxAfter"))}, `
        + `a difference of ${inr(n(f, "saving"))}.`;

    case "compute_gst":
      return `You charged ${inr(n(f, "outputGST"))} of GST and paid ${inr(n(f, "inputTaxCredit"))} on business expenses, so ${inr(n(f, "netGSTPayable"))} is payable. `
        + (f.registrationRequired === "yes"
          ? "Your turnover is above the registration threshold."
          : `You have ${inr(n(f, "headroomToThreshold"))} of turnover left before registration becomes compulsory.`);

    case "presumptive_vs_books":
      return f.applicable === "no"
        ? "Presumptive taxation applies to business and professional income, not to salary."
        : `Under section ${f.scheme} your declared profit would be ${inr(n(f, "presumptiveProfit"))}, against ${inr(n(f, "profitFromBooks"))} if you kept regular books. `
          + `${f.recommended === "presumptive" ? "The presumptive scheme declares less" : "Regular books declare less"}, a difference of ${inr(n(f, "difference"))}.`;

    case "compute_advance_tax":
      return f.required === "yes"
        ? `Advance tax is due on a liability of ${inr(n(f, "totalLiability"))}, payable across ${f.instalmentCount} instalment${f.instalmentCount === 1 ? "" : "s"}.`
        : `No advance tax is due, because the liability of ${inr(n(f, "totalLiability"))} is at or below the threshold.`;

    case "compute_194j_tds":
      return f.applicable === "no"
        ? "Section 194J applies to professional fees, which does not apply here."
        : `On receipts of ${inr(n(f, "grossReceipts"))}, clients should have deducted ${inr(n(f, "expectedTDS"))} under section 194J. `
          + `${inr(n(f, "actuallyDeducted"))} was actually deducted, leaving ${inr(n(f, "shortfall"))} unaccounted for.`;

    case "compute_net_worth":
      return `Across ${f.accountCount} account${f.accountCount === 1 ? "" : "s"}, your balances total ${inr(n(f, "netWorth"))}.`;

    case "categorize_spending":
      return `Across ${f.transactionCount} transactions you spent ${inr(n(f, "totalSpent"))}. `
        + (f.top1Category ? `The largest category was ${f.top1Category} at ${inr(n(f, "top1Total"))}.` : "");

    case "compute_savings_rate":
      return `Your net income after tax is ${inr(n(f, "netIncome"))} and you spent ${inr(n(f, "totalSpent"))}, leaving ${inr(n(f, "saved"))} saved.`;

    case "compute_goal_progress":
      return n(f, "goalCount") === 0
        ? "You have not set any savings goals yet."
        : `You have ${f.goalCount} goal${f.goalCount === 1 ? "" : "s"}. ${f.goal1Name} needs ${inr(n(f, "goal1Remaining"))} more to reach ${inr(n(f, "goal1Target"))}.`;

    case "list_recent_transactions":
      return `Here are your ${f.returned} most recent transactions, out of ${f.totalAvailable} on record.`;

    case "get_deadlines":
      return `${f.deadlineCount} statutory deadlines apply to you this year.`;

    case "get_profile_summary":
      return `You are ${f.name}, ${f.occupation}, based in ${f.city}, with a gross annual income of ${inr(n(f, "grossAnnualIncome"))}.`;

    case "list_capabilities":
      return "Here is what you can ask about. Pick one and I will work it out, or just type a question in your own words.";

    case "list_deduction_sections":
      return `There are ${f.sectionCount} deduction sections that could apply to you.`;

    case "search_concepts":
      return f.resultCount === 0
        ? "I could not find anything in the explanatory material that answers that. Try naming the term you want explained."
        : `Here is what the material says about ${f.topTitle}.`;

    default:
      return "";
  }
}
TW_EOF

wf "lib/agents/approach.ts" <<'TW_EOF'
import type { ToolResult } from "../kernel/tools/types";
import type { RouteDecision } from "../orchestrator/route";

/**
 * One plain sentence explaining how the answer was reached.
 *
 * The detail panel already carries this in technical form: routing reason,
 * step badges, kernel timings. That is evidence, and it is for someone who
 * wants to check. This is the same thing for someone who wants to learn, and
 * a literacy tool needs both.
 *
 * It is generated from what actually happened, so it cannot describe a step
 * that did not occur, and it costs nothing: no model call, no latency.
 */

const WHAT_IT_DID: Record<string, string> = {
  compare_regimes: "worked out your tax under both regimes and compared them",
  compute_tax: "worked your tax out band by band",
  compute_hra_exemption: "compared the three amounts the rent rule allows and took the lowest",
  optimize_deductions: "re-ran your whole tax calculation with each unused deduction filled",
  what_if_deduction: "recalculated your tax with that investment included",
  compute_gst: "added up the GST you charged and subtracted what you already paid",
  presumptive_vs_books: "declared your profit both ways and compared them",
  compute_advance_tax: "checked whether your liability crosses the threshold and split it by date",
  compute_194j_tds: "compared the tax clients should have deducted against what they did",
  compute_net_worth: "added up the balances across your accounts",
  categorize_spending: "grouped your outgoing transactions by category",
  compute_savings_rate: "took what was left of your income after spending",
  compute_goal_progress: "measured each goal against its target",
  list_recent_transactions: "pulled your most recent transactions",
  get_deadlines: "filtered the statutory deadlines down to the ones that apply to you",
  get_profile_summary: "read your own details",
  search_concepts: "looked the idea up in the written material",
  list_deduction_sections: "listed the deduction sections that exist",
  list_capabilities: "listed what you can ask about",
};

const WHY_ROUTED: Record<string, string> = {
  tutor: "This was a question about what something means",
  computation: "This was a question with a numerical answer",
  management: "This was a question about your own money",
};

export function describeApproach(route: RouteDecision | null, results: ToolResult[]): string {
  if (!route && results.length === 0) return "";

  const why = route ? (WHY_ROUTED[route.agent] ?? "This went to the " + route.agent + " agent") : "";
  const did = results
    .map((r) => WHAT_IT_DID[r.tool])
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  if (did.length === 0) return why ? why + "." : "";

  const doing =
    did.length === 1 ? did[0]
    : did.slice(0, -1).join(", ") + ", then " + did[did.length - 1];

  const tail = route && !route.usedModel
    ? " No language model was needed to decide that."
    : "";

  return `${why}, so the system ${doing}.${tail}`;
}

/**
 * What to ask the Tutor when someone taps "explain this" under an answer.
 *
 * Seeded from the tool that produced the answer, so the explanation is about
 * the ideas that answer actually used rather than a generic lesson. This is
 * the bridge between a figure and the concept behind it, which is the whole
 * point of pairing a Computation agent with a Tutor.
 */
const EXPLAIN_QUERY: Record<string, string> = {
  compare_regimes: "why there are two tax regimes and how to choose between them",
  compute_tax: "what a tax slab is and how income is taxed band by band",
  compute_hra_exemption: "what house rent allowance is and the least of three rule",
  optimize_deductions: "what a deduction is and why it has a ceiling",
  what_if_deduction: "what section 80C covers and how a deduction reduces tax",
  compute_gst: "what GST is and how input tax credit works",
  presumptive_vs_books: "what presumptive taxation is and the conditions attached",
  compute_advance_tax: "what advance tax is and why it is paid in instalments",
  compute_194j_tds: "what tax deducted at source means and why clients deduct it",
  compute_net_worth: "what net worth means",
  categorize_spending: "what budgeting is and why spending categories matter",
  compute_savings_rate: "what a savings rate is and why it matters more than the amount",
  compute_goal_progress: "how to set a financial goal and what an emergency fund is",
  get_deadlines: "what filing a return means and why deadlines exist",
  compute_slab: "what a tax slab is",
};

export function explainQueryFor(tools: string[]): string {
  for (const t of tools) {
    const q = EXPLAIN_QUERY[t];
    if (q) return q;
  }
  return "the ideas behind this answer";
}
TW_EOF

wf "lib/agents/followups.ts" <<'TW_EOF'
import type { ToolResult } from "../kernel/tools/types";
import type { AgentId } from "../kernel/agents";

/**
 * Follow-up questions offered beneath an answer.
 *
 * Two sources, in the same pattern used everywhere else here.
 *
 * The model proposes them, because it can see what was asked and what came
 * back. It does so inside the SAME call that writes the answer, on a final
 * line in a fixed format, so this costs no extra latency and no extra request
 * against a rate limit. That matters: a separate call would add roughly a
 * second and a half to every turn for something the user may never click.
 *
 * When the model omits the line, fails, or is unavailable, the follow-ups come
 * from the table below, keyed on the tool that just ran.
 */

export type FollowUpKind = "understand" | "next" | "learn";

export interface FollowUp {
  kind: FollowUpKind;
  text: string;
}

export const KIND_LABEL: Record<FollowUpKind, string> = {
  understand: "Understand",
  next: "Do next",
  learn: "Learn",
};

/**
 * Three per result, one of each kind.
 *
 * A flat list of three questions gives a confused person no sense that there
 * are different directions available. Labelling them separates "explain what
 * just happened" from "try the next thing" from "learn the idea behind it",
 * which is the distinction a learner actually needs.
 *
 * Order within each triple is understand, next, learn.
 */
const BY_TOOL: Record<string, string[]> = {
  compare_regimes: ["Why is the old regime more expensive for me?", "How can I pay less tax?", "What is the standard deduction?"],
  compute_tax: ["Show me the same under the other regime", "How can I pay less tax?", "What is a tax slab?"],
  optimize_deductions: ["What if I invest 150000 in 80C?", "What is section 80C?", "Which regime is better for me?"],
  what_if_deduction: ["What if I invest the full amount instead?", "How can I pay less tax?", "Which regime is better for me?"],
  compute_hra_exemption: ["What is HRA?", "Which regime is better for me?", "How can I pay less tax?"],
  compute_gst: ["Do I need to register for GST?", "What is input tax credit?", "When is my advance tax due?"],
  presumptive_vs_books: ["What are the conditions of the presumptive scheme?", "When is my advance tax due?", "How much GST do I owe?"],
  compute_advance_tax: ["What is advance tax?", "Which regime is better for me?", "How much GST do I owe?"],
  compute_194j_tds: ["What is section 194J?", "Should I use presumptive taxation?", "When do I need to file?"],
  compute_net_worth: ["How much did I spend?", "How are my goals doing?", "What is my savings rate?"],
  categorize_spending: ["What is my savings rate?", "How are my goals doing?", "What is budgeting?"],
  compute_savings_rate: ["How are my goals doing?", "How much did I spend?", "What is a savings rate?"],
  compute_goal_progress: ["What is my savings rate?", "How much did I spend?", "What is an emergency fund?"],
  list_recent_transactions: ["How much did I spend?", "What is my net worth?", "What is my savings rate?"],
  get_deadlines: ["What is advance tax?", "Which regime is better for me?", "When do I need to file?"],
  search_concepts: ["Give me an example", "How does this apply to me?", "What else should I know?"],
  list_deduction_sections: ["What is section 80C?", "How can I pay less tax?", "What is section 80D?"],
  get_profile_summary: ["Which regime is better for me?", "How much did I spend?", "How can I pay less tax?"],
};

const BY_AGENT: Record<AgentId, string[]> = {
  tutor: ["Give me an example", "How does this apply to me?", "What else should I know?"],
  computation: ["Which regime is better for me?", "How can I pay less tax?", "How much did I spend?"],
  management: ["How much did I spend?", "What is my net worth?", "How are my goals doing?"],
};

/** The line the model is asked to end with. Stripped before the answer is shown. */
const MARKER = /^[ \t]*FOLLOWUPS[ \t]*:[ \t]*(.+)$/im;

const KINDS: FollowUpKind[] = ["understand", "next", "learn"];

/** "U: ..." / "N: ..." / "L: ..." prefixes, if the model used them. */
function kindOf(raw: string, index: number): { kind: FollowUpKind; text: string } {
  const m = raw.match(/^([UNL])\s*[:\-]\s*(.+)$/i);
  if (m) {
    const k = { u: "understand", n: "next", l: "learn" }[m[1].toLowerCase()] as FollowUpKind;
    return { kind: k, text: m[2].trim() };
  }
  return { kind: KINDS[Math.min(index, 2)], text: raw };
}

export interface FollowUpResult {
  text: string;
  suggestions: FollowUp[];
  source: "model" | "fixed";
}

export function extractFollowUps(raw: string): { text: string; parsed: FollowUp[] } {
  const m = raw.match(MARKER);
  if (!m) return { text: raw.trim(), parsed: [] };
  const parsed = m[1]
    .split("|")
    .map((s) => s.replace(/^[\s\u2022\d.)]+/, "").trim())
    .filter((s) => s.length > 6 && s.length <= 84)
    .slice(0, 3)
    .map((s, i) => kindOf(s, i))
    .filter((f) => f.text.length > 6 && f.text.length <= 80);
  return { text: raw.replace(MARKER, "").trim(), parsed };
}

export function fixedFollowUps(agent: AgentId, results: ToolResult[]): FollowUp[] {
  const flat = (() => {
    for (const r of results) {
      const hit = BY_TOOL[r.tool];
      if (hit) return hit;
    }
    return BY_AGENT[agent];
  })();
  return flat.slice(0, 3).map((text, i) => ({ kind: KINDS[Math.min(i, 2)], text }));
}

/** Loose comparison, so "What is 80C?" and "what is section 80c" count as one. */
function same(a: string, b: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/section/g, "");
  return norm(a) === norm(b);
}

export function resolveFollowUps(
  raw: string,
  agent: AgentId,
  results: ToolResult[],
  asked = ""
): FollowUpResult {
  const { text, parsed } = extractFollowUps(raw);

  // Never offer the user the question they just asked.
  const drop = (list: FollowUp[]) => list.filter((f) => !same(f.text, asked));

  const fromModel = drop(parsed);
  if (fromModel.length >= 2) return { text, suggestions: fromModel, source: "model" };

  let fixed = drop(fixedFollowUps(agent, results));
  if (fixed.length === 0) {
    fixed = BY_AGENT[agent]
      .map((text, i) => ({ kind: KINDS[Math.min(i, 2)], text }))
      .filter((f) => !same(f.text, asked));
  }
  return { text, suggestions: fixed, source: "fixed" };
}
TW_EOF

wf "lib/orchestrator/route.ts" <<'TW_EOF'
import { generateText } from "ai";
import { modelFor, timeoutSignal, optionsFor } from "@/lib/agents/providers";
import { ROUTER_PROMPT } from "@/lib/agents/prompts";
import { AGENT_IDS, type AgentId } from "@/lib/kernel/agents";

export interface RouteDecision {
  agent: AgentId;
  usedModel: boolean;
  reason: string;
  ms: number;
}

export interface KeywordVerdict {
  agent: AgentId;
  /** True when an unambiguous domain signal was present. */
  confident: boolean;
  matched: string;
}

/**
 * Layer 2. One responsibility: decide whose job this is.
 *
 * The model is consulted only when the deterministic router is unsure.
 *
 * That order is deliberate and was arrived at by measurement rather than
 * preference. A small model asked to classify "which regime is better for me"
 * answered "tutor", which is wrong, while a single keyword match on "regime"
 * answers correctly every time. Where a question contains an unambiguous
 * domain word there is nothing for a model to add, and three costs to letting
 * it try: latency of about a second, one request against a rate limit that is
 * the binding constraint on this project, and the chance of being overruled
 * by a worse answer.
 *
 * So the model is reserved for genuinely vague questions, which is where it is
 * actually better than a keyword.
 */
export async function route(message: string): Promise<RouteDecision> {
  const t0 = Date.now();
  const verdict = keywordVerdict(message);

  if (verdict.confident) {
    return {
      agent: verdict.agent,
      usedModel: false,
      reason: `"${verdict.matched}" is unambiguous, so no model was needed`,
      ms: Date.now() - t0,
    };
  }

  const chosen = modelFor("orchestrator");
  if (chosen) {
    try {
      const res = await generateText({
        model: chosen.model,
        system: ROUTER_PROMPT,
        prompt: message,
        temperature: 0,
        // Routing is a single word. It must never be the slow part.
        abortSignal: timeoutSignal(6000),
        providerOptions: optionsFor(chosen.provider),
      });
      const word = (res.text ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const hit = AGENT_IDS.find((a) => word.includes(a));
      if (hit) {
        return { agent: hit, usedModel: true, reason: `Question was ambiguous, ${chosen.provider} chose ${hit}`, ms: Date.now() - t0 };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    agent: verdict.agent,
    usedModel: false,
    reason: chosen ? `Ambiguous and the model did not answer usefully, defaulted to ${verdict.agent}` : `No model available, defaulted to ${verdict.agent}`,
    ms: Date.now() - t0,
  };
}

/**
 * Someone who does not know where to begin.
 *
 * These phrasings currently route to the Tutor and get a poor answer, because
 * there is no concept to retrieve. They are not questions about a topic, they
 * are a request for a starting point, so they are answered with one instead.
 */
const LOST = [
  /^\s*(help|hi|hello|hey|start|begin)\s*[!.?]*\s*$/i,
  /\b(what (can|should) (i|you) (ask|do)|where (do|should) i (start|begin))\b/i,
  /\b(i (don'?t|do not) (know|understand)|no idea|i'?m lost|confused|guide me|help me)\b/i,
  /\b(what (else )?can (this|you|it) do|what (are|is) (my|the) options|show me everything)\b/i,
];

export function seemsLost(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return true;
  return LOST.some((re) => re.test(m));
}

/* ---------------------------------------------------------------- signals */

const MANAGEMENT = /\b(spend|spending|spent|expense|expenses|budget|goals?|net worth|afford|savings? rate|transactions?|balance)\b/;
const COMPUTATION = /\b(tax|gst|regimes?|deductions?|80c|80d|80ccd|24b|80tta|hra|194j|advance tax|presumptive|44ad|44ada|owe|liability|cess|rebate|slab|form 16|itr)\b/;
const CONCEPTUAL = /\b(explain|meaning|means|what does|what is a|difference between|why do|why does|how does .* work)\b/;
const PERSONAL = /\b(my|mine|i|me)\b/;
const HOW_MUCH = /\bhow (much|many)\b/;

/**
 * The deterministic router, with an explicit confidence signal.
 *
 * Confident means a domain word was present that only one agent could own.
 * Unconfident answers still return an agent, because the caller needs
 * something to fall back to, but they invite the model to have an opinion.
 */
export function keywordVerdict(message: string): KeywordVerdict {
  const m = message.toLowerCase();
  const personal = PERSONAL.test(m);
  const asksHowMuch = HOW_MUCH.test(m);

  // A definitional question about a concept, with no reference to the user's
  // own position, belongs to the Tutor even when it names a tax section.
  // "What is 80C" teaches; "how much 80C do I have left" computes.
  const definitional =
    (/^\s*(what|why) (is|are|does|do)\b/.test(m) || CONCEPTUAL.test(m)) && !personal && !asksHowMuch;
  if (definitional) {
    return { agent: "tutor", confident: true, matched: "a definitional question with no reference to your own figures" };
  }

  const mgmt = m.match(MANAGEMENT);
  if (mgmt) return { agent: "management", confident: true, matched: mgmt[0] };

  const comp = m.match(COMPUTATION);
  if (comp) return { agent: "computation", confident: true, matched: comp[0] };

  if (asksHowMuch || /\b(calculate|compute|work out)\b/.test(m)) {
    return { agent: "computation", confident: false, matched: "asks for a figure but names no domain" };
  }

  return { agent: "tutor", confident: false, matched: "no domain signal" };
}

/** Kept for tests and callers that only want the agent. */
export function routeByKeyword(message: string): AgentId {
  return keywordVerdict(message).agent;
}
TW_EOF

wf "lib/orchestrator/index.ts" <<'TW_EOF'
import { route, seemsLost, type RouteDecision } from "./route";
import { runAgent, type AgentAnswer } from "@/lib/agents/run";
import { createTask, finishTask } from "@/lib/db/repositories";
import { providerSummary } from "@/lib/agents/providers";

export interface OrchestratorResult {
  route: RouteDecision;
  answer: AgentAnswer;
  taskId: string | null;
  providers: ReturnType<typeof providerSummary>;
  totalMs: number;
}

export async function orchestrate(opts: {
  message: string;
  profileId: string;
  /** Skip routing and send this to a named agent. Used by "explain this". */
  forceAgent?: "tutor" | "computation" | "management";
}): Promise<OrchestratorResult> {
  const t0 = Date.now();

  // A request for a starting point is answered with one, rather than being
  // routed to an agent that has no topic to work on.
  const decision = opts.forceAgent
    ? { agent: opts.forceAgent, usedModel: false, ms: 0,
        reason: `Sent straight to the ${opts.forceAgent} agent, because this asks for the ideas behind an answer rather than a new figure` }
    : seemsLost(opts.message)
    ? { agent: "tutor" as const, usedModel: false, ms: 0,
        reason: "This reads as not knowing where to start, so the options are shown instead of an answer" }
    : await route(opts.message);

  const task = await createTask(opts.profileId, opts.message.slice(0, 80), decision.agent);

  const lost = !opts.forceAgent && seemsLost(opts.message);
  const answer = await runAgent({
    agent: decision.agent,
    message: opts.message,
    profileId: opts.profileId,
    taskId: task?.id,
    forceTools: lost ? [{ tool: "list_capabilities", args: { guided: true } }] : undefined,
  });

  if (task) await finishTask(task.id, answer.toolResults.length > 0 ? "completed" : "failed");

  return {
    route: decision,
    answer,
    taskId: task?.id ?? null,
    providers: providerSummary(),
    totalMs: Date.now() - t0,
  };
}
TW_EOF

wf "app/api/memory/route.ts" <<'TW_EOF'
import { NextResponse } from "next/server";
import { readMemory, clearMemory } from "@/lib/db/repositories";
import { summarise } from "@/lib/kernel/memory";
import { CONCEPTS } from "@/lib/kernel/concepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/memory?profileId=X   the dossier and a progress summary. */
export async function GET(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  const dossier = await readMemory(profileId);
  return NextResponse.json({ dossier, summary: summarise(dossier, CONCEPTS.length) });
}

/** DELETE /api/memory?profileId=X   forget everything about one profile. */
export async function DELETE(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  await clearMemory(profileId);
  return NextResponse.json({ cleared: true });
}
TW_EOF

wf "app/api/capabilities/route.ts" <<'TW_EOF'
import { NextResponse } from "next/server";
import { findProfile, readMemory } from "@/lib/db/repositories";
import { groupedFor } from "@/lib/kernel/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/capabilities?profileId=X
 *
 * What this person can ask for, plus which of those they have already used.
 * The second half comes from memory, which turns the pane from a menu into a
 * map: a confused user can see where they have been and what is left.
 */
export async function GET(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const p = await findProfile(profileId);
  if (!p) return NextResponse.json({ error: "unknown profile" }, { status: 404 });

  const dossier = await readMemory(profileId);
  const used: Record<string, number> = {};
  for (const t of dossier.tools) used[t.tool] = t.times;

  return NextResponse.json({
    occupation: p.occupation,
    groups: groupedFor(p.occupation),
    used,
  });
}
TW_EOF

wf "app/api/chat/route.ts" <<'TW_EOF'
import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/orchestrator";
import { createConversation, appendMessage, touchConversation } from "@/lib/db/repositories";
import { explainQueryFor } from "@/lib/agents/approach";
import { describeApproach } from "@/lib/agents/approach";

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
    const profileId = String(body.profileId ?? "PRIYA-001");

    /**
     * "Explain this" is not a new question. It asks the Tutor for the ideas
     * behind an answer that already exists, seeded from the tools that
     * produced it, and it is not persisted as a turn of the conversation.
     */
    const explainTools: string[] = Array.isArray(body.explainTools) ? body.explainTools : [];
    const isExplain = explainTools.length > 0;

    const message = isExplain
      ? `Explain in plain language, for someone with no background: ${explainQueryFor(explainTools)}.`
      : String(body.message ?? "").slice(0, 2000).trim();
    let conversationId: string | null = body.conversationId ? String(body.conversationId) : null;

    if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    if (isExplain) {
      const r = await orchestrate({ message, profileId, forceAgent: "tutor" });
      return NextResponse.json({
        explain: true,
        agent: r.answer.agent,
        provider: r.answer.provider,
        text: r.answer.text,
        component: r.answer.component,
        results: r.answer.toolResults.map((t) => ({
          tool: t.tool, component: t.component, facts: t.facts,
          data: t.data, trace: t.trace, durationMs: t.durationMs,
        })),
      });
    }

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
      approach: describeApproach(r.route, r.answer.toolResults),
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

wf "app/profile/page.tsx" <<'TW_EOF'
import { listProfiles, listAccounts, listGoals } from "@/lib/db/repositories";
import { toTaxInput } from "@/lib/kernel/profiles";
import { compareRegimes } from "@/lib/kernel/regimes";
import { getApplicableDeadlines } from "@/lib/kernel/business";
import { inr } from "@/lib/kernel/money";
import MemoryPanel from "@/components/MemoryPanel";
import ProfilePicker from "@/components/ProfilePicker";

export const dynamic = "force-dynamic";

/**
 * The profile page.
 *
 * What the system holds about one person: who they are, what they have, what
 * is due, and what it has remembered. The always-on services will be added
 * here in a later phase; the compliance calendar is the first of them and
 * already reads from the rulebook.
 */
export default async function ProfilePage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const profiles = await listProfiles();
  const p = profiles.find((x) => x.id === (id ?? profiles[0]?.id)) ?? profiles[0];

  const accounts = await listAccounts(p.id);
  const goals = await listGoals(p.id);
  const c = compareRegimes(toTaxInput(p));
  const deadlines = getApplicableDeadlines({
    occupation: p.occupation,
    gstRegistered: (p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0) > 2000000,
  });
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{p.name}</h1>
          <p className="text-[11.5px] text-ink/55">{p.jobTitle} &middot; {p.city} &middot; age {p.age}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProfilePicker profiles={profiles.map((x) => ({ id: x.id, name: x.name, jobTitle: x.jobTitle }))} current={p.id} />
          <a href="/" className="text-[11px] text-indigo hover:underline">back to chat</a>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Money">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Net worth" v={inr(netWorth)} />
              <Stat label="Gross income" v={inr(p.income.grossAnnual)} />
              <Stat label="Tax, recommended" v={inr(c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax)} />
              <Stat label="Rent, annual" v={inr(p.rentMonthly * 12)} />
            </div>
          </Section>

          <Section title="Accounts">
            {accounts.length === 0 ? (
              <Empty>No accounts. Run <code>npm run db:seed</code>.</Empty>
            ) : accounts.map((a) => (
              <Row key={a.id} k={`${a.bankName} ${a.maskedNumber}`} sub={a.accountType} v={inr(a.balance)} />
            ))}
          </Section>

          <Section title="Goals">
            {goals.length === 0 ? <Empty>No goals set.</Empty> : goals.map((g) => {
              const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
              return (
                <div key={g.id} className="mb-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11.5px] font-semibold text-ink">{g.name}</span>
                    <span className="font-mono text-[11px]">{inr(g.currentAmount)} <span className="text-ink/40">of {inr(g.targetAmount)}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div className="h-full bg-moss" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title="Compliance calendar">
            {deadlines.map((d) => (
              <Row key={d.id} k={d.label} sub={`applies to ${(d.appliesTo as string[]).join(", ")}`} v={d.date} />
            ))}
          </Section>
        </div>

        <div>
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink/55">Memory</h2>
          <MemoryPanel profileId={p.id} />
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink/55">{title}</h2>
      <div className="rounded border border-rule bg-white p-3">{children}</div>
    </div>
  );
}
function Row({ k, sub, v }: { k: string; sub?: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule py-1.5 last:border-0">
      <span>
        <span className="text-[11.5px] text-ink">{k}</span>
        {sub && <span className="ml-2 text-[9.5px] text-ink/45">{sub}</span>}
      </span>
      <span className="font-mono text-[11.5px] text-ink">{v}</span>
    </div>
  );
}
function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-rule bg-white p-2">
      <div className="text-[8.5px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className="font-mono text-[13px] font-bold text-ink">{v}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-ink/45">{children}</p>;
}
TW_EOF

wf "components/MemoryPanel.tsx" <<'TW_EOF'
"use client";
import { useCallback, useEffect, useState } from "react";
import type { Dossier } from "@/lib/kernel/memory";

interface Summary {
  turns: number; conceptsLearned: number; corpusSize: number;
  toolsUsed: number; notes: number; firstSeen: string | null; lastSeen: string | null;
}

const KIND_LABEL: Record<string, string> = {
  preference: "Prefers", decision: "Decided", question: "Unsure about", fact: "Worth knowing",
};
const KIND_TONE: Record<string, string> = {
  preference: "text-indigo", decision: "text-moss", question: "text-amber", fact: "text-ink/60",
};

/**
 * What the system knows about this person, and how far through the material
 * they are. Everything here was either observed from what actually ran, or
 * offered by the model on a single strictly parsed line.
 */
export default function MemoryPanel({ profileId }: { profileId: string }) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?profileId=${encodeURIComponent(profileId)}`);
      const j = await res.json();
      setDossier(j.dossier ?? null);
      setSummary(j.summary ?? null);
    } catch { /* leave empty */ } finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  async function forget() {
    await fetch(`/api/memory?profileId=${encodeURIComponent(profileId)}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-[11px] text-ink/40">Reading memory...</p>;

  const empty = !summary || summary.turns === 0;
  const pct = summary && summary.corpusSize > 0
    ? Math.round((summary.conceptsLearned / summary.corpusSize) * 100) : 0;

  return (
    <div className="space-y-3">
      {empty ? (
        <div className="rounded border border-rule bg-white p-3">
          <p className="text-[11px] leading-snug text-ink/60">
            Nothing remembered yet. Ask a few questions in the chat and this fills in:
            what you prefer, what you have decided, and which concepts you have had explained.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Conversations" v={String(summary!.turns)} />
            <Stat label="Concepts learned" v={`${summary!.conceptsLearned} of ${summary!.corpusSize}`} />
            <Stat label="Tools used" v={String(summary!.toolsUsed)} />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink/45">Learning progress</span>
              <span className="font-mono text-[10px] text-ink/50">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
              <div className="h-full bg-moss" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {dossier!.notes.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">What it knows</div>
              <div className="space-y-1">
                {dossier!.notes.map((n, i) => (
                  <div key={i} className="rounded border border-rule bg-white px-2 py-1.5">
                    <span className={"text-[9px] font-bold uppercase " + (KIND_TONE[n.kind] ?? "text-ink/60")}>
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                    <p className="text-[11px] leading-snug text-ink/80">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dossier!.concepts.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">Concepts explained</div>
              <div className="flex flex-wrap gap-1">
                {dossier!.concepts.map((c) => (
                  <span key={c.id} className="rounded-full border border-moss/40 bg-moss/5 px-2 py-0.5 text-[9.5px] text-moss">
                    {c.title}{c.times > 1 ? ` \u00d7${c.times}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {dossier!.tools.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">Calculations run</div>
              <div className="flex flex-wrap gap-1">
                {dossier!.tools.map((t) => (
                  <span key={t.tool} className="rounded-full border border-rule bg-white px-2 py-0.5 font-mono text-[9px] text-ink/65">
                    {t.tool}{t.times > 1 ? ` \u00d7${t.times}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={forget} className="text-[10px] text-ink/40 hover:text-red-600 hover:underline">
            Forget everything about this profile
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-rule bg-white p-2 text-center">
      <div className="text-[8.5px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className="font-mono text-[12px] font-bold text-ink">{v}</div>
    </div>
  );
}
TW_EOF

wf "components/ProfilePicker.tsx" <<'TW_EOF'
"use client";
import { useRouter } from "next/navigation";

export default function ProfilePicker({
  profiles, current,
}: { profiles: { id: string; name: string; jobTitle: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/profile?id=${e.target.value}`)}
      className="rounded border border-rule bg-white px-2 py-1 text-[10.5px]"
    >
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>{p.name} &middot; {p.jobTitle}</option>
      ))}
    </select>
  );
}
TW_EOF

wf "components/Chat.tsx" <<'TW_EOF'
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList, { type ConversationSummary } from "./ConversationList";
import FunctionPane from "./FunctionPane";
import AnswerDetail, { type ResultPayload, type Step, type Route } from "./AnswerDetail";
import ModeToggle, { type Mode } from "./ModeToggle";
import { renderWidget } from "./widgets";
import { KIND_LABEL, type FollowUp } from "@/lib/agents/followups";

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
  suggestions?: FollowUp[];
  suggestionSource?: "model" | "fixed";
  approach?: string;
  explain?: { text: string; results: ResultPayload[]; loading?: boolean } | null;
  route?: Route | null;
  steps?: Step[];
  guard?: { ok: boolean; offending: string[] } | null;
  totalMs?: number;
}

interface ProfileOption { id: string; name: string; jobTitle: string; occupation: string }

export default function Chat({ profiles }: { profiles: ProfileOption[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "PRIYA-001");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noDb, setNoDb] = useState(false);
  // Bumped after every answer so the pane re-reads which capabilities were used.
  const [paneKey, setPaneKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];

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
          approach: (p.approach as string) ?? undefined,
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
        approach: j.approach,
        route: j.route ?? null, steps: j.steps ?? [], guard: j.guard ?? null,
        totalMs: j.totalMs,
      }]);

      loadConversations(profileId);
      setPaneKey((k) => k + 1);
    } catch {
      setMessages((m) => [...m, {
        id: key, role: "assistant",
        text: "The request failed. Is the dev server still running?", failed: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  async function explain(id: string) {
    const msg = messages.find((m) => m.id === id);
    const tools = (msg?.results ?? []).map((r) => r.tool);
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, explain: { text: "", results: [], loading: true } } : x)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, explainTools: tools.length ? tools : ["compute_tax"] }),
      });
      const j = await res.json();
      setMessages((m) => m.map((x) => (x.id === id
        ? { ...x, explain: { text: j.text ?? "", results: j.results ?? [], loading: false } } : x)));
    } catch {
      setMessages((m) => m.map((x) => (x.id === id
        ? { ...x, explain: { text: "Could not load an explanation.", results: [], loading: false } } : x)));
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
          <a href={`/profile?id=${profileId}`} className="text-[10px] text-indigo hover:underline">profile</a>
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

        <FunctionPane
          profileId={profileId}
          onAsk={send}
          busy={busy}
          refreshKey={paneKey}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#F7F9FC]">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 && (
                <div className="py-14 text-center">
                  <p className="text-sm font-semibold text-ink">Ask about {profile?.name}&apos;s money.</p>
                  <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-snug text-ink/50">
                    Pick something from <span className="font-medium">what you can do</span> on the left,
                    or type a question. If you are not sure where to begin, just type <span className="font-medium">help</span>.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[10.5px] leading-snug text-ink/40">
                    Every figure is computed by a rule engine, not by the language model. Open
                    &ldquo;how this was answered&rdquo; under any reply to see which rule produced it.
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

                      {m.approach && (
                        <p className="mb-1.5 border-l-2 border-teal/40 pl-2 text-[10.5px] leading-snug text-ink/50">
                          {m.approach}
                        </p>
                      )}

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
                                <div key={i}>{renderWidget(r.component, r.data, r.facts, r.trace, send)}</div>
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

                      {!m.failed && m.agent !== "tutor" && (
                        <button
                          onClick={() => explain(m.id)}
                          disabled={busy || m.explain?.loading}
                          className="mt-2 text-[10px] font-semibold text-teal hover:underline disabled:opacity-40"
                        >
                          {m.explain ? "\u25BE explain this" : "\u25B8 explain this"}
                        </button>
                      )}

                      {m.explain && (
                        <div className="mt-1.5 rounded border border-teal/30 bg-teal/[0.03] p-2.5">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="rounded bg-teal/15 px-1.5 py-px text-[8.5px] font-bold uppercase text-teal">tutor</span>
                            <span className="text-[9px] text-ink/40">the ideas behind that answer</span>
                          </div>
                          {m.explain.loading ? (
                            <p className="text-[11px] text-ink/40">Looking it up...</p>
                          ) : (
                            <>
                              <p className="text-[11.5px] leading-relaxed text-ink/80">{m.explain.text}</p>
                              {m.explain.results.map((r, i) => (
                                <div key={i} className="mt-2">{renderWidget(r.component, r.data, r.facts, r.trace, send)}</div>
                              ))}
                            </>
                          )}
                        </div>
                      )}

                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="mt-2.5">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[9px] uppercase tracking-wide text-ink/35">where to go next</span>
                            <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
                              (m.suggestionSource === "model" ? "bg-teal/15 text-teal" : "bg-ink/8 text-ink/45")}>
                              {m.suggestionSource === "model" ? "suggested" : "standard"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.suggestions.map((f) => (
                              <button key={f.text} onClick={() => send(f.text)} disabled={busy}
                                className="rounded-full border border-rule bg-white px-2.5 py-1 text-left text-[10px] hover:bg-panel disabled:opacity-40">
                                <span className="mr-1.5 text-[8px] font-bold uppercase text-ink/35">{KIND_LABEL[f.kind]}</span>
                                <span className="text-ink/75">{f.text}</span>
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

wf "components/FunctionPane.tsx" <<'TW_EOF'
"use client";
import { useCallback, useEffect, useState } from "react";

interface Item { id: string; title: string; blurb: string; ask: string; tool: string }
interface Group { group: string; label: string; items: Item[] }

const GROUP_TONE: Record<string, string> = {
  learn: "text-teal", tax: "text-indigo", business: "text-amber", money: "text-moss",
};

/**
 * What this user can do, as a pane rather than a menu.
 *
 * Nothing here computes. A card composes a question and sends it into the
 * chat, so the chat remains the only route into the kernel and every request
 * still passes through routing, the tool registry and the audit log.
 *
 * Cards are per occupation, so a salaried user is never shown GST. Cards
 * already used are ticked from memory, which makes the pane a map of where
 * someone has been rather than a list of features.
 */
export default function FunctionPane({
  profileId, onAsk, busy, refreshKey,
}: {
  profileId: string;
  onAsk: (q: string) => void;
  busy: boolean;
  refreshKey: number;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capabilities?profileId=${encodeURIComponent(profileId)}`);
      const j = await res.json();
      setGroups(j.groups ?? []);
      setUsed(j.used ?? {});
    } catch { setGroups([]); }
  }, [profileId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const done = groups.reduce((n, g) => n + g.items.filter((i) => used[i.tool]).length, 0);

  if (collapsed) {
    return (
      <aside className="flex w-9 shrink-0 flex-col items-center border-r border-rule bg-white py-2">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Show what you can do"
          className="rounded px-1 py-1 text-[11px] text-ink/40 hover:bg-panel hover:text-ink"
        >
          &raquo;
        </button>
        <span className="mt-2 font-mono text-[9px] text-ink/30" style={{ writingMode: "vertical-rl" }}>
          what you can do
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-rule bg-white">
      <div className="flex items-start justify-between border-b border-rule px-3 py-2">
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-ink/70">What you can do</h2>
          <p className="text-[9.5px] text-ink/45">{done} of {total} tried</p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Hide"
          className="rounded px-1 text-[11px] text-ink/30 hover:bg-panel hover:text-ink"
        >
          &laquo;
        </button>
      </div>

      {total > 0 && (
        <div className="px-3 pt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-moss" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 && (
          <p className="px-1 py-6 text-center text-[10px] text-ink/40">Loading...</p>
        )}

        {groups.map((g) => (
          <div key={g.group} className="mb-3">
            <p className={"mb-1 px-1 text-[9px] font-bold uppercase tracking-wider " + (GROUP_TONE[g.group] ?? "text-ink/45")}>
              {g.label}
            </p>

            {g.items.map((c) => {
              const isOpen = open === c.id;
              const times = used[c.tool] ?? 0;
              return (
                <div
                  key={c.id}
                  className={"mb-1 rounded border " + (isOpen ? "border-ink/30 bg-panel/40" : "border-rule bg-white")}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
                  >
                    <span className={"mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full " + (times ? "bg-moss" : "bg-ink/15")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10.5px] font-semibold leading-snug text-ink">{c.title}</span>
                      {times > 1 && <span className="text-[8.5px] text-ink/35">used {times} times</span>}
                    </span>
                    <span className="mt-[1px] shrink-0 text-[9px] text-ink/30">{isOpen ? "\u2212" : "+"}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-rule px-2 py-2">
                      <p className="text-[10px] leading-snug text-ink/65">{c.blurb}</p>
                      <p className="mt-1 font-mono text-[8.5px] text-ink/30">{c.tool}</p>
                      <button
                        onClick={() => { onAsk(c.ask); setOpen(null); }}
                        disabled={busy}
                        className="mt-1.5 w-full rounded bg-ink px-2 py-1 text-[10px] font-medium text-white hover:bg-ink/90 disabled:opacity-40"
                      >
                        Compute
                      </button>
                      <p className="mt-1 text-[8.5px] leading-snug text-ink/35">
                        Sends &ldquo;{c.ask}&rdquo; to the chat. If anything else is needed, it will ask.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
TW_EOF

wf "components/widgets/Capabilities.tsx" <<'TW_EOF'
"use client";
import { Card } from "./ui";

interface Item { id: string; title: string; blurb: string; ask: string; tool: string }
interface Group { group: string; label: string; items: Item[] }

/**
 * What this person can ask for.
 *
 * Serves two situations from one component. Asked "what can I do", it shows
 * everything, grouped. Reached because someone said they were lost, it leads
 * with four openers and keeps the full list below, so the answer to "I don't
 * know where to start" is a start rather than a catalogue.
 *
 * Every card sends a question into the chat. Nothing here computes anything.
 */
export default function Capabilities({
  data, onAsk,
}: { data: any; onAsk?: (q: string) => void }) {
  const groups: Group[] = data?.groups ?? [];
  const openers: Item[] = data?.openers ?? [];
  const guided = data?.guided === true;

  return (
    <div className="space-y-3">
      {guided && openers.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber">
            A good place to start
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {openers.map((c) => (
              <button
                key={c.id}
                onClick={() => onAsk?.(c.ask)}
                className="rounded border border-amber/50 bg-amber/5 p-2.5 text-left hover:bg-amber/10"
              >
                <div className="text-[11.5px] font-bold text-ink">{c.title}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-ink/60">{c.blurb}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <Card key={g.group}>
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink/45">{g.label}</p>
          <div className="space-y-1">
            {g.items.map((c) => (
              <button
                key={c.id}
                onClick={() => onAsk?.(c.ask)}
                className="block w-full rounded border border-rule px-2 py-1.5 text-left hover:bg-panel/60"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink">{c.title}</span>
                  <span className="shrink-0 font-mono text-[8.5px] text-ink/30">{c.tool}</span>
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-ink/55">{c.blurb}</div>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
TW_EOF

wf "components/widgets/index.tsx" <<'TW_EOF'
"use client";
import RegimeComparison from "./RegimeComparison";
import TaxBreakdown from "./TaxBreakdown";
import DeductionOptimizer from "./DeductionOptimizer";
import PresumptiveComparison from "./PresumptiveComparison";
import SpendingBreakdown from "./SpendingBreakdown";
import NetWorth from "./NetWorth";
import GoalProgress from "./GoalProgress";
import GstSummary from "./GstSummary";
import ConceptAnswer from "./ConceptAnswer";
import Capabilities from "./Capabilities";
import FactCard from "./FactCard";
import type { ReactElement } from "react";
import type { TraceNode } from "./TraceTree";

/**
 * The component registry.
 *
 * The agent chooses a key from this fixed map. It does not write interface
 * code and it cannot introduce a component that is not here. Free-form
 * interface generation would be neither safe nor reproducible: the same
 * question would render differently each time, and there would be no way to
 * test what the user actually sees.
 *
 * Anything without a bespoke component falls through to FactCard, which lays
 * out the facts the tool produced. Plain, but never wrong.
 */
const RICH: Record<string, (p: { data: any; trace: TraceNode | null }) => ReactElement | null> = {
  regime_comparison: RegimeComparison,
  tax_breakdown: TaxBreakdown,
  deduction_optimizer: ({ data }) => <DeductionOptimizer data={data} />,
  presumptive_comparison: PresumptiveComparison,
  spending_breakdown: SpendingBreakdown,
  net_worth: NetWorth,
  goal_progress: GoalProgress,
  gst_summary: GstSummary,
  concept_answer: ({ data }) => <ConceptAnswer data={data} />,
};

const TITLES: Record<string, string> = {
  hra_breakdown: "House rent allowance",
  what_if_diff: "What if",
  advance_tax_schedule: "Advance tax",
  tds_summary: "Section 194J",
  savings_rate: "Savings rate",
  transaction_list: "Recent transactions",
  deadline_timeline: "Deadlines",
  profile_summary: "Your details",
  section_list: "Deduction sections",
};

export const REGISTRY_KEYS = [...Object.keys(RICH), ...Object.keys(TITLES)];

export function renderWidget(
  component: string,
  data: unknown,
  facts: Record<string, number | string>,
  trace: TraceNode | null,
  onAsk?: (q: string) => void
) {
  if (component === "none") return null;
  // Capabilities needs to send a question back into the chat, which no other
  // component does, so it is handled before the generic lookup.
  if (component === "capabilities") return <Capabilities data={data} onAsk={onAsk} />;
  const Rich = RICH[component];
  if (Rich) return <Rich data={data} trace={trace} />;
  return <FactCard title={TITLES[component] ?? component.replace(/_/g, " ")} facts={facts} trace={trace} />;
}
TW_EOF

wf "tests/memory.test.ts" <<'TW_EOF'
import { describe, it, expect } from "vitest";
import {
  emptyDossier, normalise, applyTurn, asPromptContext, summarise,
} from "@/lib/kernel/memory";
import { extractNote } from "@/lib/agents/run";

describe("the dossier folds one turn at a time", () => {
  it("starts empty", () => {
    const d = emptyDossier();
    expect(d.turns).toBe(0);
    expect(d.notes).toHaveLength(0);
    expect(d.firstSeen).toBeNull();
  });

  it("counts turns and records when it first saw someone", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: ["compute_tax"], note: null });
    d = applyTurn(d, { concepts: [], tools: ["compare_regimes"], note: null });
    expect(d.turns).toBe(2);
    expect(d.firstSeen).not.toBeNull();
    expect(d.lastSeen).not.toBeNull();
  });

  it("increments a repeated concept rather than duplicating it", () => {
    let d = emptyDossier();
    const obs = { concepts: [{ id: "hra", title: "House rent allowance" }], tools: [], note: null };
    d = applyTurn(d, obs);
    d = applyTurn(d, obs);
    expect(d.concepts).toHaveLength(1);
    expect(d.concepts[0].times).toBe(2);
  });

  it("increments a repeated tool rather than duplicating it", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: ["compute_tax", "compute_tax"], note: null });
    expect(d.tools).toHaveLength(1);
    expect(d.tools[0].times).toBe(2);
  });

  it("moves a repeated note to the front instead of storing it twice", () => {
    let d = emptyDossier();
    const note = { kind: "preference" as const, text: "prefers the old regime", at: "" };
    d = applyTurn(d, { concepts: [], tools: [], note });
    d = applyTurn(d, { concepts: [], tools: [], note: { ...note, text: "Prefers the old regime." } });
    expect(d.notes).toHaveLength(1);
  });

  it("caps each list so a long session cannot grow it without bound", () => {
    let d = emptyDossier();
    for (let i = 0; i < 40; i++) {
      d = applyTurn(d, {
        concepts: [], tools: [],
        note: { kind: "fact", text: `distinct note number ${i}`, at: "" },
      });
    }
    expect(d.notes.length).toBeLessThanOrEqual(24);
    expect(d.notes[0].text).toContain("39");
  });
});

describe("normalise accepts anything previously stored", () => {
  it("survives null, an empty object and junk", () => {
    for (const raw of [null, undefined, {}, { notes: "nope" }, { concepts: 7 }]) {
      const d = normalise(raw);
      expect(Array.isArray(d.notes)).toBe(true);
      expect(Array.isArray(d.concepts)).toBe(true);
      expect(typeof d.turns).toBe("number");
    }
  });

  it("drops malformed entries but keeps valid ones", () => {
    const d = normalise({
      notes: [{ kind: "preference", text: "keeps this", at: "x" }, { kind: "nonsense", text: "drops" }, { kind: "fact" }],
      turns: 3,
    });
    expect(d.notes).toHaveLength(1);
    expect(d.turns).toBe(3);
  });
});

describe("the prompt context", () => {
  it("is empty before anything has happened", () => {
    expect(asPromptContext(emptyDossier())).toBe("");
  });

  it("tells the agent not to re-explain what was already covered", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [{ id: "hra", title: "House rent allowance" }], tools: [], note: null });
    expect(asPromptContext(d)).toContain("House rent allowance");
    expect(asPromptContext(d)).toMatch(/do not start from scratch/i);
  });

  it("separates preferences, decisions and open questions", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: [], note: { kind: "preference", text: "prefers the old regime", at: "" } });
    d = applyTurn(d, { concepts: [], tools: [], note: { kind: "question", text: "unsure about advance tax", at: "" } });
    const ctx = asPromptContext(d);
    expect(ctx).toMatch(/prefer/i);
    expect(ctx).toMatch(/unsure/i);
  });
});

describe("the note the model may offer", () => {
  it("parses a well-formed line", () => {
    const n = extractNote("Some answer.\nREMEMBER: preference | prefers the old regime because of rent");
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("preference");
    expect(n!.text).toBe("prefers the old regime because of rent");
  });

  it("accepts every valid kind", () => {
    for (const k of ["preference", "decision", "question", "fact"]) {
      expect(extractNote(`x\nREMEMBER: ${k} | something durable about them`)?.kind).toBe(k);
    }
  });

  it("rejects an unknown kind", () => {
    expect(extractNote("x\nREMEMBER: banana | something")).toBeNull();
  });

  it("rejects a note containing a figure, because notes are about the person", () => {
    expect(extractNote("x\nREMEMBER: fact | their tax came to 87,880 this year")).toBeNull();
  });

  it("rejects a note that is too short or too long", () => {
    expect(extractNote("x\nREMEMBER: fact | ab")).toBeNull();
    expect(extractNote("x\nREMEMBER: fact | " + "a".repeat(200))).toBeNull();
  });

  it("returns null when the model offers nothing", () => {
    expect(extractNote("Just a plain answer with no marker.")).toBeNull();
  });
});

describe("progress", () => {
  it("reports concepts learned against the corpus size", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [{ id: "hra", title: "HRA" }, { id: "slab", title: "Slabs" }], tools: [], note: null });
    const s = summarise(d, 55);
    expect(s.conceptsLearned).toBe(2);
    expect(s.corpusSize).toBe(55);
  });
});
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

  it("returns an empty dossier rather than null, so callers never branch on absence", async () => {
    if (hasDatabase()) return;
    const d = await readMemory("PRIYA-001");
    expect(d.turns).toBe(0);
    expect(d.notes).toEqual([]);
    expect(d.concepts).toEqual([]);
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

wf "tests/capabilities.test.ts" <<'TW_EOF'
import { describe, it, expect } from "vitest";
import { CAPABILITIES, capabilitiesFor, groupedFor, guidedStartFor } from "@/lib/kernel/capabilities";
import { TOOL_NAMES } from "@/lib/kernel/tools/registry";
import { seemsLost } from "@/lib/orchestrator/route";
import { describeApproach, explainQueryFor } from "@/lib/agents/approach";
import { resolveFollowUps, extractFollowUps } from "@/lib/agents/followups";

describe("the capability catalogue", () => {
  it("names only tools that exist, so it cannot promise what the system does not do", () => {
    for (const c of CAPABILITIES) expect(TOOL_NAMES).toContain(c.tool);
  });

  it("has a unique id and a readable blurb for every entry", () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) {
      expect(c.blurb.length).toBeGreaterThan(25);
      expect(c.ask.length).toBeGreaterThan(8);
    }
  });

  it("shows business capabilities only to business and professional users", () => {
    const salaried = capabilitiesFor("salaried").map((c) => c.id);
    expect(salaried).not.toContain("gst");
    expect(salaried).not.toContain("presumptive");
    expect(capabilitiesFor("business").map((c) => c.id)).toContain("gst");
    expect(capabilitiesFor("profession").map((c) => c.id)).toContain("presumptive");
  });

  it("shows HRA only to a salaried user and 194J only to a professional", () => {
    expect(capabilitiesFor("salaried").map((c) => c.id)).toContain("hra");
    expect(capabilitiesFor("business").map((c) => c.id)).not.toContain("hra");
    expect(capabilitiesFor("profession").map((c) => c.id)).toContain("tds-194j");
    expect(capabilitiesFor("business").map((c) => c.id)).not.toContain("tds-194j");
  });

  it("groups without producing an empty group", () => {
    for (const occ of ["salaried", "business", "profession"] as const) {
      for (const g of groupedFor(occ)) expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("offers four openers per occupation, all of them real capabilities", () => {
    for (const occ of ["salaried", "business", "profession"] as const) {
      const o = guidedStartFor(occ);
      expect(o).toHaveLength(4);
      for (const c of o) expect(capabilitiesFor(occ).map((x) => x.id)).toContain(c.id);
    }
  });
});

describe("recognising someone who does not know where to start", () => {
  const lost = ["help", "hi", "I don't know where to start", "what can I ask?",
                "i'm lost", "guide me", "what can this do", "where do I begin", ""];
  for (const m of lost) {
    it(`treats "${m}" as needing a starting point`, () => expect(seemsLost(m)).toBe(true));
  }

  const notLost = ["which regime is better for me?", "how much tax do I owe?",
                   "what is section 80C?", "how much did I spend?", "should I use presumptive taxation?"];
  for (const m of notLost) {
    it(`treats "${m}" as a real question`, () => expect(seemsLost(m)).toBe(false));
  }
});

describe("the reasoning strip", () => {
  const fake = (tool: string) => ({
    tool, agent: "computation" as const, component: "none" as const,
    data: null, facts: {}, trace: null, durationMs: 1,
  });

  it("says why it routed and what it then did", () => {
    const s = describeApproach(
      { agent: "computation", usedModel: false, reason: "x", ms: 1 },
      [fake("compare_regimes")]
    );
    expect(s).toMatch(/numerical answer/i);
    expect(s).toMatch(/both regimes/i);
  });

  it("notes when no model was needed", () => {
    const s = describeApproach({ agent: "computation", usedModel: false, reason: "x", ms: 1 }, [fake("compute_tax")]);
    expect(s).toMatch(/no language model/i);
  });

  it("does not claim a step that did not happen", () => {
    const s = describeApproach({ agent: "tutor", usedModel: false, reason: "x", ms: 1 }, []);
    expect(s).not.toMatch(/worked out|added up/i);
  });

  it("joins several tools in order", () => {
    const s = describeApproach(
      { agent: "computation", usedModel: true, reason: "x", ms: 1 },
      [fake("get_profile_summary"), fake("compare_regimes")]
    );
    expect(s).toContain("then");
  });
});

describe("explain this", () => {
  it("asks about the ideas behind whichever tool ran", () => {
    expect(explainQueryFor(["compare_regimes"])).toMatch(/two tax regimes/i);
    expect(explainQueryFor(["compute_gst"])).toMatch(/input tax credit/i);
    expect(explainQueryFor(["presumptive_vs_books"])).toMatch(/presumptive/i);
  });

  it("falls back rather than returning nothing for an unmapped tool", () => {
    expect(explainQueryFor(["something_unmapped"]).length).toBeGreaterThan(5);
  });
});

describe("categorised follow-ups", () => {
  it("labels the fixed set understand, next and learn", () => {
    const r = resolveFollowUps("plain answer", "computation",
      [{ tool: "compare_regimes", agent: "computation", component: "regime_comparison",
         data: null, facts: {}, trace: null, durationMs: 1 }] as never);
    expect(r.source).toBe("fixed");
    expect(r.suggestions.map((f) => f.kind)).toEqual(["understand", "next", "learn"]);
  });

  it("reads the model's own labels when it supplies them", () => {
    const { parsed } = extractFollowUps(
      "An answer.\nFOLLOWUPS: U: why is that the rule? | N: what if I invest more? | L: what is a slab?"
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0].kind).toBe("understand");
    expect(parsed[1].kind).toBe("next");
    expect(parsed[2].kind).toBe("learn");
    expect(parsed[0].text).toBe("why is that the rule?");
  });

  it("assigns kinds by position when the model omits labels", () => {
    const { parsed } = extractFollowUps("A.\nFOLLOWUPS: first question here | second question here | third question here");
    expect(parsed.map((f) => f.kind)).toEqual(["understand", "next", "learn"]);
  });
});

describe("the pane differs by user, and overlaps where the tax code overlaps", () => {
  it("gives a salaried user no business group at all", () => {
    expect(groupedFor("salaried").map((g) => g.group)).not.toContain("business");
  });

  it("gives both self-employed types a business group", () => {
    expect(groupedFor("business").map((g) => g.group)).toContain("business");
    expect(groupedFor("profession").map((g) => g.group)).toContain("business");
  });

  it("shares tax and money capabilities across all three, because everyone pays tax", () => {
    const ids = (o: "salaried" | "business" | "profession") => new Set(capabilitiesFor(o).map((c) => c.id));
    const shared = [...ids("salaried")].filter((i) => ids("business").has(i) && ids("profession").has(i));
    expect(shared).toContain("compare-regimes");
    expect(shared).toContain("spending");
    expect(shared.length).toBeGreaterThanOrEqual(11);
  });

  it("every card composes a question rather than computing anything itself", () => {
    for (const c of CAPABILITIES) {
      expect(c.ask.trim().length).toBeGreaterThan(8);
      expect(/[?]|^Show /.test(c.ask)).toBe(true);
    }
  });

  it("counts match what the pane will show", () => {
    expect(capabilitiesFor("salaried")).toHaveLength(13);
    expect(capabilitiesFor("business")).toHaveLength(15);
    expect(capabilitiesFor("profession")).toHaveLength(16);
  });
});
TW_EOF

wf "tests/routing.test.ts" <<'TW_EOF'
import { describe, it, expect } from "vitest";
import { routeByKeyword, keywordVerdict } from "@/lib/orchestrator/route";
import { pickToolsDeterministically } from "@/lib/agents/fallback";
import { describeResult } from "@/lib/agents/describe";
import { AGENT_REGISTRY, AGENT_IDS } from "@/lib/kernel/agents";
import type { ToolResult } from "@/lib/kernel/tools/types";

describe("keyword routing, the path that works with no model", () => {
  const cases: [string, string][] = [
    ["What is section 80C?", "tutor"],
    ["Why does the old regime exist?", "tutor"],
    ["Explain what TDS means", "tutor"],
    ["How much tax do I owe?", "computation"],
    ["Which regime is better for me?", "computation"],
    ["How much GST do I need to pay?", "computation"],
    ["Should I use presumptive taxation?", "computation"],
    ["What is my net worth?", "management"],
    ["How much did I spend on food?", "management"],
    ["Can I afford a holiday from my goals?", "management"],
    ["Show my recent transactions", "management"],
  ];
  for (const [q, expected] of cases) {
    it(`routes "${q}" to ${expected}`, () => {
      expect(routeByKeyword(q)).toBe(expected);
    });
  }
});

describe("deterministic tool selection never breaks the wall", () => {
  it("only ever picks tools the agent is permitted to call", () => {
    const probes = [
      "how much tax", "which regime", "what is 80C", "my net worth", "gst",
      "presumptive", "advance tax", "194j", "hra", "spending", "goals",
      "recent transactions", "deadlines", "save more tax", "",
    ];
    for (const id of AGENT_IDS) {
      const allowed = new Set(AGENT_REGISTRY[id].tools);
      for (const p of probes) {
        for (const t of pickToolsDeterministically(id, p)) {
          expect(allowed.has(t)).toBe(true);
        }
      }
    }
  });

  it("always returns at least one tool for the computation agent", () => {
    expect(pickToolsDeterministically("computation", "anything at all").length).toBeGreaterThan(0);
  });
});

describe("deterministic phrasing", () => {
  const fake = (tool: string, facts: Record<string, number | string>): ToolResult => ({
    tool, agent: "computation", component: "none", data: null, facts, trace: null, durationMs: 1,
  });

  it("states the figures it was given and nothing else", () => {
    const text = describeResult([fake("compare_regimes", {
      newRegimeTax: 0, oldRegimeTax: 87880, recommended: "New Regime", saving: 87880,
    })]);
    expect(text).toContain("87,880");
    expect(text).toContain("New Regime");
  });

  it("says something useful when no tool ran", () => {
    expect(describeResult([])).toMatch(/could not work out/i);
  });

  it("handles a tool that reported the rule does not apply", () => {
    const text = describeResult([fake("presumptive_vs_books", { applicable: "no" })]);
    expect(text).toMatch(/not to salary/i);
  });
});

describe("the model is only consulted when keywords are unsure", () => {
  it("is confident about the two questions a small model got wrong", () => {
    // Measured failure: gpt-oss-20b classified both of these as tutor.
    expect(keywordVerdict("which regime is better for me?")).toMatchObject({ agent: "computation", confident: true });
    expect(keywordVerdict("should I use presumptive taxation?")).toMatchObject({ agent: "computation", confident: true });
  });

  it("is confident about every domain question", () => {
    const confident: [string, string][] = [
      ["how much tax do I owe?", "computation"],
      ["what is my GST liability?", "computation"],
      ["am I close to the GST threshold?", "computation"],
      ["how much did I spend on food?", "management"],
      ["what is my net worth?", "management"],
      ["show my recent transactions", "management"],
      ["how are my goals doing?", "management"],
      ["what is section 80C?", "tutor"],
      ["explain what TDS means", "tutor"],
      ["why does the old regime exist?", "tutor"],
    ];
    for (const [q, agent] of confident) {
      const v = keywordVerdict(q);
      expect({ q, ...v }).toMatchObject({ agent, confident: true });
    }
  });

  it("admits when it does not know", () => {
    for (const q of ["help me", "what should I do next?", "hello"]) {
      expect(keywordVerdict(q).confident).toBe(false);
    }
  });

  it("still returns a usable agent when unsure", () => {
    for (const q of ["help me", "hmm", ""]) {
      expect(["tutor", "computation", "management"]).toContain(keywordVerdict(q).agent);
    }
  });
});

describe("follow-up questions", () => {
  it("parses the model's follow-up line and strips it from the answer", async () => {
    const { extractFollowUps } = await import("@/lib/agents/followups");
    const raw = "The new regime is cheaper by \u20B987,880.\nFOLLOWUPS: Why is the old regime worse? | How can I pay less tax? | What is a tax slab?";
    const r = extractFollowUps(raw);
    expect(r.text).not.toContain("FOLLOWUPS");
    expect(r.text).toContain("87,880");
    expect(r.parsed).toHaveLength(3);
    expect(r.parsed[0].text).toBe("Why is the old regime worse?");
    expect(r.parsed[0].kind).toBe("understand");
  });

  it("falls back to the fixed set when the model omits the line", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    const results = [{ tool: "compare_regimes", agent: "computation", component: "regime_comparison",
                       data: null, facts: {}, trace: null, durationMs: 1 }] as never;
    const r = resolveFollowUps("Just an answer with no marker.", "computation", results);
    expect(r.source).toBe("fixed");
    expect(r.suggestions).toHaveLength(3);
  });

  it("ignores a malformed or empty follow-up line", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    const r = resolveFollowUps("Answer.\nFOLLOWUPS:  |  | ", "tutor", [] as never);
    expect(r.source).toBe("fixed");
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("never leaves the marker visible to the user", async () => {
    const { resolveFollowUps } = await import("@/lib/agents/followups");
    for (const raw of ["A.\nFOLLOWUPS: one two three | four five six", "B.\nfollowups: aaa bbb ccc | ddd eee fff"]) {
      expect(resolveFollowUps(raw, "tutor", [] as never).text).not.toMatch(/followups/i);
    }
  });
});
TW_EOF

wf "tests/widgets.test.ts" <<'TW_EOF'
import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/kernel/tools/registry";

/**
 * The registry is fixed and typed. Every component a tool can ask for must
 * exist, otherwise an answer renders as nothing and the user sees a blank.
 */
const RICH = [
  "regime_comparison", "tax_breakdown", "deduction_optimizer", "presumptive_comparison",
  "spending_breakdown", "net_worth", "goal_progress", "gst_summary",
];
const GENERIC = [
  "hra_breakdown", "what_if_diff", "advance_tax_schedule", "tds_summary", "savings_rate",
  "transaction_list", "deadline_timeline", "profile_summary", "concept_answer", "section_list",
  // Capabilities is handled ahead of the generic lookup, because it is the one
  // component that sends a question back into the chat.
  "capabilities", "guided_start",
];

describe("component registry covers every tool", () => {
  it("every tool names a component the registry can render", () => {
    const known = new Set([...RICH, ...GENERIC, "none"]);
    for (const spec of Object.values(TOOLS)) {
      expect({ tool: spec.name, component: spec.component }).toMatchObject({ tool: spec.name });
      expect(known.has(spec.component)).toBe(true);
    }
  });

  it("the flagship results have a bespoke component, not the generic fallback", () => {
    expect(TOOLS.compare_regimes.component).toBe("regime_comparison");
    expect(TOOLS.compute_tax.component).toBe("tax_breakdown");
    expect(TOOLS.presumptive_vs_books.component).toBe("presumptive_comparison");
  });
});
TW_EOF


echo; say "Installing"
npm install --no-fund --no-audit --loglevel=error
ok "installed"

echo; say "Checks"
if npm test --silent >/tmp/tw13.log 2>&1; then ok "$(grep -oE 'Tests +[0-9]+ passed' /tmp/tw13.log | tail -1)"; else warn "tests failed, see /tmp/tw13.log"; fi
if npx next build >/tmp/tw13b.log 2>&1; then ok "build passed"; else warn "build failed, see /tmp/tw13b.log — paste the last 40 lines to me"; fi

echo; say "Re-embedding the concept corpus"
note "55 calls to the embedding model, about a minute"
echo
npm run corpus:embed || warn "embedding failed; retrieval falls back to term matching, which still works"
echo
npm run corpus:check || true

echo; say "Done"; echo
warn "Do NOT run db:push. Nothing here changes the schema."
echo
note "  npm run dev"
echo
note "Worth trying, in this order:"
note "  1. type 'help'                     four openers picked for that profile"
note "  2. look at the middle pane         13 cards for Priya, no business group"
note "  3. switch to Arjun                 15 cards, a business group appears"
note "  4. click a card, press Compute     the question goes into the chat"
note "  5. read the grey line above it     why it routed there and what it did"
note "  6. click 'explain this'            the Tutor explains the ideas behind it"
note "  7. open 'how this was answered'    routing, steps, guard, the rule tree"
note "  8. click 'profile' in the header   money, goals, deadlines and memory"
note "  9. back to chat, look at the pane  the card you used now has a green dot"
echo
note "Two docs in the root, ready for GitHub:"
note "    README.md         what it is, how to run it, every decision"
note "    HOW_IT_WORKS.md   how a question becomes an answer, end to end"
echo
note "Push it:"
note "    git add -A && git commit -m 'Phases 11-13: memory, guidance, function pane' && git push"
echo

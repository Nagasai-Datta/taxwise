# TaxWise

**A Conversational Platform for Financial Literacy and Management using a Multi-Agent LLM Orchestrator**

BCSE497J Project-I · School of Computer Science and Engineering · Vellore Institute of Technology

**New here?** This file is the reference: what the project is, how to run it, and every decision.
For the journey of one question from keystroke to rendered card, with the file responsible at
every step, read [HOW_IT_WORKS.md](HOW_IT_WORKS.md).

The complete description of the project, including its evidence, limitations and what a paper can claim, is [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).

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
| `npm run daemons` | Run one poll of the always-on services from the terminal |

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
| `compare_investments` | Computation | every place a deduction can go, with the tax each would save. Not returns |
| `generate_invoice` | Computation | an invoice with GST on top and TDS taken off, asking for the details first |
| `explore_graph` | Computation | the whole chain of figures, with what each is computed from |
| `solve_backwards` | Computation | the input value that reaches a figure you name, solved by bisection |
| `prepare_itr` | Computation | a prepared return from Form 16 figures, in eight steps. Asks for the figures first |
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

Section 44AD deems **₹1,46,400** against **₹15,00,000** from books. GST registration **required**,
turnover being above the threshold.

### Rohan, 26, freelance designer, Pune — professional

| | |
|---|---|
| Gross receipts | ₹18,00,000 (₹10,00,000 export, ₹8,00,000 domestic) |
| Business expenses | ₹4,00,000 |
| TDS deducted by clients | ₹80,000 |

Section 44ADA deems **₹9,00,000** against ₹14,00,000 from books. **₹2,00,000 of headroom** below
the GST threshold, because exports are zero-rated. Section 194J expected ₹80,000 on domestic receipts, matching the
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
The middle pane is filtered by occupation: Priya sees 17 capabilities, Arjun 19, Rohan 20, with 11
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

**Verdicts the model may not reword.** The guard checks figures, not claims. Given "not
achievable" alongside a required value, a model wrote that the user "would need to invest
₹1,50,000 to bring tax down to ₹40,000", which is false, and every figure in it was real. Two
things changed: a value that is meaningless out of context is no longer published to the model at
all, and a tool may mark its result as one whose wording comes from the figures rather than from
the model.

**Comparing where to invest.** Eight options, compared on two kinds of fact kept deliberately
apart. What the law fixes is knowable: the section, the lock-in, how the payout is taxed. What it
saves is computable, by re-running the tax engine with that section filled. **What it returns is
neither**, so there is no return column anywhere, and `data/investments.json` contains no rate at
all. A table ranking these by an assumed return would be the most confident and least defensible
thing in the project. It also says that everything under 80C shares one ceiling, so filling one
leaves less room for the others.

**Invoicing.** For business and professional users. GST is added on top of the fee and passed to
the government, so it is never income. TDS is taken off by the client before paying, so it is not
a cost. The amount that actually arrives is therefore neither the fee nor the invoice total, and
the result says which is which.

**Invoices and investments.** An invoice is not a formatting exercise: whether GST is charged,
whether the client deducts at source, and therefore what actually reaches the bank all follow from
the rules. A freelancer who invoices ₹2,00,000 and receives ₹2,16,000 has not been short-changed,
and an overseas client deducts nothing at all because section 194J obliges an Indian payer. The
investment comparison computes the tax saved by re-running the engine, then states plainly that it
is the same whichever option is chosen, because a deduction reduces taxable income by the amount
invested. What differs is the lock-in, the certainty and where the money ends up.

**The causal finance graph.** Twenty nodes, each knowing what it is computed from. Forwards is
ordinary: move an input and everything downstream follows. **Backwards is the part nothing on the
market does**: name the tax you want to pay and find out what you would have to invest to get
there. Solved by bisection rather than algebra, because the section 87A rebate is a cliff and an
algebraic inverse steps over it without noticing. When a target cannot be reached, it says so
rather than presenting the nearest value as though it were the answer.

**Preparing a return.** `prepare_itr` runs eight deterministic steps from the figures on a Form 16
and produces a document shaped like an ITR-1, downloadable as JSON. Nothing is submitted anywhere.
No model is involved at any point, which matters most here because this is the one output a person
might act on.

**Tools that ask before they answer.** A tool may return a request for input instead of a result.
The shell renders it as a form inside the conversation, and the tool is called again with the
answers, through the same doorway with the same permission check and the same audit row. A tool
that cannot know something asks rather than guessing.

**The always-on services.** Three of them, polling on the profile page. The **compliance calendar**
watches the statutory dates that apply to this person and escalates as each approaches. The
**proactive monitor** watches transactions, turnover against the GST threshold, unused deduction
headroom near year end, and spending running ahead of receipts. The **verifiable trace** reports
what has been computed and how long it took.

They report; they never act, and they never compute an answer. Each observation can carry a
question, and pressing it hands that question to the chat, so every answer still comes from the
same path. Polling happens in the browser on a thirty minute interval, overridable with
`NEXT_PUBLIC_DAEMON_POLL_SECONDS`, with a **check now** button beside it. There is no server
timer: a background job that outlives a request would be the only part of this system that cannot
be reproduced by re-running a command.

**The payments gateway.** `/gateway` is a separate application: its own route, its own look, its
own vocabulary, and no access to the agents, the kernel or the rulebook. Add funds to any account
or send money between any two, and it writes a transaction row and updates a balance. **TaxWise
only reads that table.**

That separation is the point rather than a shortcut. An application that can see a bank without
touching it is the shape of India's Account Aggregator framework, and it is what makes the
proactive monitor demonstrable: money moves in one window, the monitor notices in the other, and
nothing in the main application had to be told. A transfer writes both sides in one database
transaction, because one that debited an account and then failed before crediting the other would
be worse than one that never happened.

**The pages.** `/` is the chat. `/profile` carries money, accounts, goals, the compliance calendar,
the always-on services and memory. `/gateway` is the payments app. `/status` is a build dashboard.

### Designed, not yet implemented

Nothing outstanding. Every item scoped for the final review is built.

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

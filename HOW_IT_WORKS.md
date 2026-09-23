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
in `lib/kernel/capabilities.ts` returns 17 cards for a salaried user and 16 for
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
| 1 | Argument schemas | `tools/registry.ts` | A fabricated income reaching a calculation. Figures on a Form 16 or an invoice come only from the form the person fills in; the model is shown those tools without that argument |
| 2 | Permission check | `tools/execute.ts` | An agent using a capability it should not have |
| 3 | Facts-only return | `tools/execute.ts` | The model quoting something it was not handed |
| 4 | The guard | `kernel/guard.ts` | The model writing a figure into its own prose, or spelling one out in words |
| 5 | Authoritative results | `tools/execute.ts` | The model inverting a verdict while quoting only real figures |

Number 4 catches the case the others cannot: the model is given ₹87,880 and
₹3,380 legitimately, adds them itself, and writes ₹91,260. Both inputs were
real; the sum was supplied by no tool. The guard rejects it. It also catches a
figure written as words, which would otherwise walk past every digit-based
check.

Number 5 catches the case number 4 cannot. Given a result saying a target is
**not** achievable, a model wrote that the user "would need to invest ₹1,50,000
to bring tax down to ₹40,000". Every figure in that sentence was real. Only the
claim was false, and a guard that inspects numbers has nothing to object to. So
a value that is meaningless out of context is no longer given to the model, and
a tool may mark its result as one whose wording is produced from the figures
rather than by the model.

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

### "Help me prepare my tax return" — a tool that asks first

```
route         "return" matched                → computation
tool          prepare_itr, with no arguments
              └─ the tool cannot know a Form 16 it has never seen,
                 so it returns needsInput instead of a result
component     input_form, rendered inside the conversation
              fields named after Form 16 Part B, prefilled from the profile

  ── the user fills it in and submits ──

POST          /api/chat { resumeTool: "prepare_itr", values: {...} }
              routing skipped, the tool is already known
callTool      same doorway, same permission check, same audit row
kernel        itr.ts, eight steps, no model at any point
component     itr_summary, with a download button
```

**A tool that cannot know something asks rather than guessing.** Until this
existed a tool either ran or failed. Preparing a return needs figures off a
document the system has never seen, and inventing them would be worse than
asking.

The download is a JSON file shaped like an ITR-1, produced on the user's own
machine. **Nothing is submitted anywhere.** Filing remains something a person
does on the government portal, with this as their working.

### "How much do I need to invest for my tax to be 40,000?" — backwards

```
route         "tax" matched                   → computation
tool          solve_backwards
              target = totalTax, targetValue = 40000, lever = d80C
kernel        graph.ts, invertGraph()
              └─ bisection over the lever's permitted range, 40 iterations
                 each step calls propagateGraph, which calls computeTax
component     inverse_result
```

**Why bisection and not algebra.** The section 87A rebate makes tax a step
function: it drops to zero in one move rather than tapering. An algebraic
inverse can return a value on the far side of that cliff without noticing it.
Bisection converges on the boundary instead.

**Why it sometimes answers "no".** Filling Priya's 80C to its ceiling only
brings her old-regime tax to ₹67,080. So ₹40,000 is genuinely unreachable by
that lever, and the honest answer is to say so rather than to present ₹67,080
as though it were what was asked for.

The sliders in `explore_graph` recompute **in the browser**, by calling
`propagateGraph` directly. The kernel has no network and no model, which is
what makes it portable enough to run in either place, and it reads the same
rulebook either way, so a preview cannot disagree with a committed answer.

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

## 6a. The services that nobody asked

Every journey above starts with a question. Three services do not.

```
browser       every 30 min, or on "check now"
GET           /api/daemons?profileId=X&since=<last poll>
              │
              ├─ complianceObservations()   the dates that apply to this person
              ├─ monitorObservations()      transactions, turnover, headroom
              └─ traceObservations()        what has been computed, from audit_log
              │
buildReport   sorted: urgent, then attention, then info
render        grouped by service, each observation optionally carrying a question
```

**They report, they never act.** Pressing the question on an observation hands
it to the chat, where it travels the same path as anything typed. Nothing on
the profile page computes an answer.

**Polling is in the browser, not on a server timer.** A background job that
outlives a request would be the only part of this system that cannot be
reproduced by re-running a command, and none of these services needs to do
anything while nobody is looking.

## 6b. Money moving, and the system noticing

The one journey that starts outside TaxWise.

```
/gateway      a separate application: its own route, its own look
              no agents, no kernel, no rulebook
POST          /api/gateway { action, amount, from, to }
validate      every problem at once, not the first
plan          a transfer is TWO entries, never one
write         both entries and both balances, in ONE database transaction
              │
              ▼
        transactions table          ← the only thing the two applications share
              │
              ▼
/profile      the proactive monitor polls, sees rows newer than its last check
              "2 new transactions: 25,000 out and 0 in since the last check"
```

**TaxWise only reads that table.** It has no way to move money, and the gateway
has no way to reach the kernel. An application that can see a bank without
touching it is the shape of India's Account Aggregator framework.

**Why both sides in one database transaction.** A transfer that debited one
account and then failed before crediting the other would be worse than one that
never happened: money would simply be gone. Either both rows land or neither
does.

## 6c. Two kinds of fact, kept apart

`compare_investments` is the clearest example of a distinction that runs through
the whole system.

```
what the LAW fixes        section, lock-in, treatment on exit
                          data/investments.json, stated as given
what it SAVES             re-run the tax engine with that section filled
                          computable, and it respects the 87A cliff
what it RETURNS           neither. No figure exists anywhere for this
```

There is no return column in the component and no rate in the data file. A
table ranking these by an assumed return would look authoritative and be
indefensible, which is the exact failure this project exists to avoid.

`generate_invoice` makes a different distinction explicit: GST sits **on top of**
the fee and is passed on, so it is never income; TDS comes **off** before the
client pays, so it is not a cost. The amount that actually arrives is neither
the fee nor the total.

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
| The gateway cannot reach the database | The payment is refused outright | Nothing. A payment is never half-recorded |
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

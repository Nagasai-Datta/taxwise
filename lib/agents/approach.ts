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

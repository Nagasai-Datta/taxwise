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
    id: "graph", group: "tax", title: "Explore what moves what",
    blurb: "Every figure in your position and what it is computed from, with sliders. Drag one and watch the rest follow.",
    ask: "Show me what moves what", tool: "explore_graph", occupations: ALL,
  },
  {
    id: "backwards", group: "tax", title: "Work backwards from a target",
    blurb: "Name the tax you want to pay and find out how much you would have to invest to get there.",
    ask: "How much do I need to invest for my tax to be 40000?", tool: "solve_backwards", occupations: ALL,
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
    id: "file-itr", group: "tax", title: "Prepare your return",
    blurb: "Enter the figures from your Form 16 and get a prepared return, with every step shown. Nothing is submitted anywhere.",
    ask: "Help me prepare my tax return", tool: "prepare_itr", occupations: ["salaried"],
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
    id: "invoice", group: "business", title: "Raise an invoice",
    blurb: "Prepare an invoice for a client. It shows the fee, the GST on top, the tax the client will deduct, and what will actually arrive.",
    ask: "Help me raise an invoice", tool: "generate_invoice", occupations: SELF,
  },
  {
    id: "tds-194j", group: "business", title: "Check what clients deducted",
    blurb: "Clients cut tax from professional fees. See what they should have cut against what they did.",
    ask: "How much TDS did my clients deduct?", tool: "compute_194j_tds", occupations: ["profession"],
  },

  /* ---------------------------------------------------------- money */
  {
    id: "investments", group: "money", title: "Compare where to invest",
    blurb: "Every place a deduction can go, with how long it is locked, how it is taxed on exit, and the exact tax each would save.",
    ask: "Where should I invest for tax purposes?", tool: "compare_investments", occupations: ALL,
  },
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

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

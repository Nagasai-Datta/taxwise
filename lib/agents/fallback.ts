import { AGENT_REGISTRY, type AgentId } from "../kernel/agents";

/**
 * Deterministic tool selection.
 *
 * Used when no model is reachable, when a model call fails, and when a model
 * replies without calling anything. It is keyword matching and makes no claim
 * to be clever. Its job is to make sure the user still gets a correct figure
 * rather than an apology, which matters more than elegance during a live
 * demonstration on a rate-limited free tier.
 */
export function pickToolsDeterministically(agent: AgentId, message: string): string[] {
  const m = message.toLowerCase();
  const allowed = new Set(AGENT_REGISTRY[agent].tools);
  const pick = (...names: string[]) => names.filter((n) => allowed.has(n));

  if (agent === "tutor") {
    if (/\b(80c|80d|deduction|section)\b/.test(m)) return pick("list_deduction_sections");
    return pick("search_concepts");
  }

  if (agent === "computation") {
    if (/\b(how much (do|would) i need|work backwards|so that my|in order (for|to))\b/.test(m)) return pick("solve_backwards");
    if (/\b(moves what|explore|graph|sliders?|what affects|knock.?on)\b/.test(m)) return pick("explore_graph");
    if (/\b(invoice|bill (a |my )?client|raise a bill)\b/.test(m)) return pick("generate_invoice");
    if (/\b(where should i invest|compare investments?|elss|ppf|nps|which investment)\b/.test(m)) return pick("compare_investments");
    if (/\b(itr|return|form ?16|file my|prepare my)\b/.test(m)) return pick("prepare_itr");
    if (/regime|old vs new|new vs old|which one|switch/.test(m)) return pick("compare_regimes");
    if (/presumptive|44ad|44ada|books/.test(m)) return pick("presumptive_vs_books");
    if (/gst|goods and services/.test(m)) return pick("compute_gst");
    if (/advance tax|instal/.test(m)) return pick("compute_advance_tax");
    if (/194j|tds|deducted by/.test(m)) return pick("compute_194j_tds");
    if (/hra|rent allowance/.test(m)) return pick("compute_hra_exemption");
    if (/save|saving|reduce|optimi|deduction|80c/.test(m)) return pick("optimize_deductions");
    if (/what if|if i invest|suppose/.test(m)) return pick("optimize_deductions");
    return pick("compute_tax");
  }

  // management
  if (/net worth|total.*(balance|money)|how much do i have/.test(m)) return pick("compute_net_worth");
  if (/goal|target|afford|save up/.test(m)) return pick("compute_goal_progress");
  if (/spend|spending|expense|category|categories/.test(m)) return pick("categorize_spending");
  if (/saving rate|savings rate|how much.*sav/.test(m)) return pick("compute_savings_rate");
  if (/transaction|recent|last few/.test(m)) return pick("list_recent_transactions");
  if (/deadline|due date|when.*file/.test(m)) return pick("get_deadlines");
  return pick("compute_net_worth", "categorize_spending");
}

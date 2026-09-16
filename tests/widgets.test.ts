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

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

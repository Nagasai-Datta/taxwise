import { RULES } from "./rules";
import type { HRAInput, TraceNode } from "./types";
import { inr, rupees } from "./money";

export interface HRAResult {
  exemption: number;
  candidates: { label: string; value: number }[];
  winnerIndex: number;
  trace: TraceNode;
}

/**
 * House Rent Allowance exemption.
 *
 * The exemption is the LEAST of three amounts. Returning all three, and
 * which one won, is what lets the interface explain the result instead of
 * asserting it.
 */
export function computeHRAExemption(args: HRAInput): HRAResult {
  const { basicAnnual, hraReceivedAnnual, rentAnnual, isMetro } = args;
  const cityRate = isMetro ? RULES.hra.metroRate : RULES.hra.nonMetroRate;

  const candidates = [
    { label: "Actual HRA received from the employer", value: rupees(hraReceivedAnnual) },
    {
      label: `${isMetro ? "50%" : "40%"} of basic salary (${isMetro ? "metro city" : "non-metro city"})`,
      value: rupees(basicAnnual * cityRate),
    },
    {
      label: "Rent paid minus 10% of basic salary",
      value: Math.max(0, rupees(rentAnnual - basicAnnual * RULES.hra.rentOffsetRate)),
    },
  ];

  const exemption = Math.min(...candidates.map((c) => c.value));
  const winnerIndex = candidates.findIndex((c) => c.value === exemption);

  return {
    exemption,
    candidates,
    winnerIndex,
    trace: {
      ruleId: "hra.least_of_three",
      label: `HRA exemption is the least of three amounts. The lowest was: ${candidates[winnerIndex].label}.`,
      inputs: {
        basicAnnual,
        hraReceivedAnnual,
        rentAnnual,
        city: isMetro ? "metro" : "non-metro",
      },
      output: exemption,
      children: candidates.map((c, i) => ({
        ruleId: `hra.candidate[${i}]`,
        label: `${c.label} = ${inr(c.value)}${i === winnerIndex ? "   <- lowest, so this is the exemption" : ""}`,
        inputs: {},
        output: c.value,
      })),
    },
  };
}

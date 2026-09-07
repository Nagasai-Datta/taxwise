import rulesJson from "@/data/tax_rules.json";
import type { Slab } from "./types";

/**
 * The single versioned rulebook.
 *
 * The language model is allowed to read the labels in here so it can phrase
 * an explanation. It is never handed the raw rates, because it never performs
 * arithmetic.
 */
export const RULES = rulesJson;

export function regime(id: "new" | "old") {
  return RULES.regimes[id];
}

export function slabsFor(id: "new" | "old"): Slab[] {
  return regime(id).slabs as Slab[];
}

export function allowedDeductions(id: "new" | "old"): string[] {
  return regime(id).allowedDeductions as string[];
}

export function deductionMeta(section: string): { label: string; cap: number | null } | undefined {
  return (RULES.deductions as Record<string, { label: string; cap: number | null }>)[section];
}

/** Section names and plain-English labels only. Safe to hand to a model. */
export function deductionCatalogue() {
  return Object.entries(RULES.deductions).map(([section, d]) => ({
    section,
    label: (d as { label: string }).label,
    cap: (d as { cap: number | null }).cap,
  }));
}

export function isVerified(): boolean {
  return RULES._meta.verification.status === "VERIFIED";
}

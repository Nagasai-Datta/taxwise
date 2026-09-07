import profilesJson from "@/data/profiles.json";
import type { TaxInput } from "./types";

export interface Profile {
  id: string;
  name: string;
  age: number;
  occupation: "salaried" | "business" | "profession";
  jobTitle: string;
  city: string;
  isMetro: boolean;
  exercises: string;
  bank: { name: string; maskedNumber: string; balance: number; type: string };
  businessBank?: { name: string; maskedNumber: string; balance: number; type: string };
  income: {
    grossAnnual: number;
    basicAnnual?: number;
    hraReceivedAnnual?: number;
    turnoverAnnual?: number;
    grossReceiptsAnnual?: number;
    businessExpensesAnnual?: number;
    digitalReceiptShare?: number;
    exportReceipts?: number;
    domesticReceipts?: number;
    tds194JDeducted?: number;
    gstOnExpensesPaid?: number;
  };
  rentMonthly: number;
  deductions: Record<string, number>;
}

export function allProfiles(): Profile[] {
  return profilesJson.profiles as unknown as Profile[];
}

export function getProfile(id: string): Profile | undefined {
  return allProfiles().find((p) => p.id.toUpperCase() === id.toUpperCase());
}

/** Convert a stored profile into the shape the tax engine expects. */
export function toTaxInput(p: Profile): Omit<TaxInput, "regime"> {
  return {
    grossIncome: p.income.grossAnnual,
    isSalaried: p.occupation === "salaried",
    deductions: p.deductions,
    hra:
      p.income.basicAnnual && p.income.hraReceivedAnnual
        ? {
            basicAnnual: p.income.basicAnnual,
            hraReceivedAnnual: p.income.hraReceivedAnnual,
            rentAnnual: p.rentMonthly * 12,
            isMetro: p.isMetro,
          }
        : undefined,
  };
}

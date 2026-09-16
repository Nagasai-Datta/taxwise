import { inr } from "../kernel/money";
import type { ToolResult } from "../kernel/tools/types";

/**
 * Deterministic phrasing.
 *
 * Used whenever the model is unavailable, fails, or writes a figure the guard
 * rejects. Every sentence here is built only from facts a tool produced, so
 * this path can never state a wrong number. It is plainer than the model's
 * prose; it is never less correct.
 */
export function describeResult(results: ToolResult[]): string {
  if (results.length === 0) {
    return "I could not work out which calculation you needed. Try asking about your tax, your spending, or a specific deduction.";
  }
  return results.map(describeOne).filter(Boolean).join(" ");
}

function n(f: Record<string, number | string>, k: string): number {
  const v = f[k];
  return typeof v === "number" ? v : 0;
}

function describeOne(r: ToolResult): string {
  const f = r.facts;
  switch (r.tool) {
    case "compute_tax":
      return `Under the ${f.regime}, your taxable income comes to ${inr(n(f, "taxableIncome"))} and the tax on that is ${inr(n(f, "totalTax"))}.`
        + (n(f, "rebate87A") > 0 ? ` A section 87A rebate of ${inr(n(f, "rebate87A"))} was applied.` : "");

    case "compare_regimes":
      return `The new regime gives a tax of ${inr(n(f, "newRegimeTax"))} and the old regime gives ${inr(n(f, "oldRegimeTax"))}. `
        + `The ${f.recommended} is cheaper for you by ${inr(n(f, "saving"))}.`;

    case "compute_hra_exemption":
      return f.applicable === "no"
        ? "You do not draw a salary with a house rent allowance component, so no HRA exemption arises."
        : `Your HRA exemption works out to ${inr(n(f, "exemption"))}, which is the lowest of the three amounts the rule compares.`;

    case "optimize_deductions":
      return `Your tax under the old regime is currently ${inr(n(f, "baselineTax"))}. There are ${f.opportunityCount} deductions you have not fully used, `
        + `and filling all of them would bring it to ${inr(n(f, "bestPossibleTax"))}, a saving of ${inr(n(f, "totalPotentialSaving"))}.`;

    case "what_if_deduction":
      return `Claiming ${inr(n(f, "amountClaimed"))} under ${f.section} moves your tax from ${inr(n(f, "taxBefore"))} to ${inr(n(f, "taxAfter"))}, `
        + `a difference of ${inr(n(f, "saving"))}.`;

    case "compute_gst":
      return `You charged ${inr(n(f, "outputGST"))} of GST and paid ${inr(n(f, "inputTaxCredit"))} on business expenses, so ${inr(n(f, "netGSTPayable"))} is payable. `
        + (f.registrationRequired === "yes"
          ? "Your turnover is above the registration threshold."
          : `You have ${inr(n(f, "headroomToThreshold"))} of turnover left before registration becomes compulsory.`);

    case "presumptive_vs_books":
      return f.applicable === "no"
        ? "Presumptive taxation applies to business and professional income, not to salary."
        : `Under section ${f.scheme} your declared profit would be ${inr(n(f, "presumptiveProfit"))}, against ${inr(n(f, "profitFromBooks"))} if you kept regular books. `
          + `${f.recommended === "presumptive" ? "The presumptive scheme declares less" : "Regular books declare less"}, a difference of ${inr(n(f, "difference"))}.`;

    case "compute_advance_tax":
      return f.required === "yes"
        ? `Advance tax is due on a liability of ${inr(n(f, "totalLiability"))}, payable across ${f.instalmentCount} instalment${f.instalmentCount === 1 ? "" : "s"}.`
        : `No advance tax is due, because the liability of ${inr(n(f, "totalLiability"))} is at or below the threshold.`;

    case "compute_194j_tds":
      return f.applicable === "no"
        ? "Section 194J applies to professional fees, which does not apply here."
        : `On receipts of ${inr(n(f, "grossReceipts"))}, clients should have deducted ${inr(n(f, "expectedTDS"))} under section 194J. `
          + `${inr(n(f, "actuallyDeducted"))} was actually deducted, leaving ${inr(n(f, "shortfall"))} unaccounted for.`;

    case "compute_net_worth":
      return `Across ${f.accountCount} account${f.accountCount === 1 ? "" : "s"}, your balances total ${inr(n(f, "netWorth"))}.`;

    case "categorize_spending":
      return `Across ${f.transactionCount} transactions you spent ${inr(n(f, "totalSpent"))}. `
        + (f.top1Category ? `The largest category was ${f.top1Category} at ${inr(n(f, "top1Total"))}.` : "");

    case "compute_savings_rate":
      return `Your net income after tax is ${inr(n(f, "netIncome"))} and you spent ${inr(n(f, "totalSpent"))}, leaving ${inr(n(f, "saved"))} saved.`;

    case "compute_goal_progress":
      return n(f, "goalCount") === 0
        ? "You have not set any savings goals yet."
        : `You have ${f.goalCount} goal${f.goalCount === 1 ? "" : "s"}. ${f.goal1Name} needs ${inr(n(f, "goal1Remaining"))} more to reach ${inr(n(f, "goal1Target"))}.`;

    case "list_recent_transactions":
      return `Here are your ${f.returned} most recent transactions, out of ${f.totalAvailable} on record.`;

    case "get_deadlines":
      return `${f.deadlineCount} statutory deadlines apply to you this year.`;

    case "get_profile_summary":
      return `You are ${f.name}, ${f.occupation}, based in ${f.city}, with a gross annual income of ${inr(n(f, "grossAnnualIncome"))}.`;

    case "list_capabilities":
      return "Here is what you can ask about. Pick one and I will work it out, or just type a question in your own words.";

    case "list_deduction_sections":
      return `There are ${f.sectionCount} deduction sections that could apply to you.`;

    case "search_concepts":
      return f.resultCount === 0
        ? "I could not find anything in the explanatory material that answers that. Try naming the term you want explained."
        : `Here is what the material says about ${f.topTitle}.`;

    default:
      return "";
  }
}

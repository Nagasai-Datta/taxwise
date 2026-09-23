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

    case "compute_194j_tds": {
      if (f.applicable === "no") return "Section 194J applies to professional fees, which does not apply here.";
      const short = n(f, "shortfall");
      return `Only clients in India deduct tax under section 194J. On ${inr(n(f, "domesticReceipts"))} from Indian clients, `
        + `${inr(n(f, "expectedTDS"))} should have been deducted and ${inr(n(f, "actuallyDeducted"))} was. `
        + (short > 0 ? `Clients deducted ${inr(short)} less than expected.`
          : short < 0 ? `That is ${inr(-short)} more than expected, which comes back when you file.`
          : "The two match, so nothing is missing.");
    }

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

    case "compare_investments":
      return `Your tax under the old regime is ${inr(n(f, "baselineTax"))}. `
        + `${f.withHeadroom} of ${f.optionCount} options still have room, and the largest single saving is `
        + `${inr(n(f, "largestSaving"))} through ${f.largestSavingOption}. `
        + "They are compared on the section, the lock-in and the tax treatment, not on returns.";

    case "generate_invoice":
      return f.applicable === "no"
        ? "An invoice is raised by someone billing a client. A salaried employee is paid through payroll instead."
        : f.status === "awaiting invoice details"
          ? "Tell me who it is for and what the work was, and I will prepare it. Nothing is sent to anyone."
          : `Invoice for ${f.client}: ${inr(n(f, "fee"))} in fees`
            + (n(f, "gst") > 0 ? ` plus ${inr(n(f, "gst"))} of GST, ${inr(n(f, "invoiceTotal"))} in total` : ", with no GST charged")
            + (n(f, "tdsExpected") > 0 ? `. The client will deduct ${inr(n(f, "tdsExpected"))} as TDS, so ${inr(n(f, "amountYouShouldReceive"))} should reach you.` : ".");

    case "explore_graph":
      return `Here is your whole position under the ${f.regime}, every figure and what it is computed from. `
        + `Tax is ${inr(n(f, "totalTax"))} on a taxable income of ${inr(n(f, "taxableIncome"))}. `
        + "Drag a slider and everything below it recomputes.";

    case "solve_backwards": {
      const picked = f.leverChosenAutomatically === "yes"
        ? ` I worked it through ${f.lever}, since you did not say which to move.` : "";
      // The lever is always a rupee amount. The target may be a percentage.
      const tgt = (k: string) =>
        f.targetIsRate === "yes" ? `${Math.round(n(f, k) * 100) / 100}%` : inr(n(f, k));
      return f.achievable === "yes"
        ? `${f.lever} would need to be ${inr(n(f, "requiredLever"))}, against ${inr(n(f, "currentLever"))} now. That brings ${f.target} to ${tgt("achievedValue")}.${picked}`
        : `${f.target} cannot reach ${tgt("wantedValue")} by changing ${f.lever} alone, whatever value it is set to. `
          + `Across its whole range the best it manages is ${tgt("bestAchievable")}, from ${tgt("currentValue")} now.${picked}`;
    }

    case "prepare_itr":
      return f.applicable === "no"
        ? "A return is prepared from a Form 16, which only a salaried employee receives."
        : f.status === "awaiting Form 16 details"
          ? "I need the figures from your Form 16 before I can prepare anything. Fill in what you have below; anything you leave at zero is treated as zero."
          : `Prepared under the ${f.regimeChosen}. Tax comes to ${inr(n(f, "taxPayable"))} against ${inr(n(f, "tdsDeducted"))} already deducted, so ${
              n(f, "refundDue") > 0 ? `${inr(n(f, "refundDue"))} is due back to you`
              : n(f, "balancePayable") > 0 ? `${inr(n(f, "balancePayable"))} is still payable`
              : "nothing is payable and nothing is refundable"}.`;

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

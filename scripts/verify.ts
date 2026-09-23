/**
 * Prints every profile's full computation so the figures can be checked by
 * hand against the official calculator.
 *
 *   npm run verify
 */
import { allProfiles, toTaxInput } from "../lib/kernel/profiles";
import { compareRegimes } from "../lib/kernel/regimes";
import { computeGST, presumptiveVsBooks, computeAdvanceTax, compute194J } from "../lib/kernel/business";
import { inr } from "../lib/kernel/money";
import { RULES } from "../lib/kernel/rules";

const bar = (n = 76) => console.log("-".repeat(n));
const row = (k: string, v: string) => console.log("    " + k.padEnd(30) + v);

console.log("");
console.log("TaxWise kernel verification");
console.log(`FY ${RULES._meta.financialYear}  ·  AY ${RULES._meta.assessmentYear}  ·  ${RULES._meta.governingAct}`);
console.log("");
if (RULES._meta.verification.status !== "VERIFIED") {
  console.log("  *** THESE FIGURES ARE NOT YET VERIFIED ***");
  console.log("  Run: npm run checklist   then check each figure against the official calculator.");
  console.log("");
}

for (const p of allProfiles()) {
  bar();
  console.log(`${p.name}  (${p.id})  ${p.jobTitle}, ${p.city}`);
  console.log(`exercises: ${p.exercises}`);
  bar();

  const c = compareRegimes(toTaxInput(p));

  console.log("  INPUTS");
  row("Gross annual income", inr(p.income.grossAnnual));
  if (p.income.basicAnnual) row("Basic salary", inr(p.income.basicAnnual));
  if (p.income.hraReceivedAnnual) row("HRA received", inr(p.income.hraReceivedAnnual));
  row("Rent paid (annual)", inr(p.rentMonthly * 12));
  row("City treated as", p.isMetro ? "metro, 50% of basic" : "non-metro, 40% of basic");
  for (const [s, v] of Object.entries(p.deductions)) if (v > 0) row(`Deduction ${s}`, inr(v));
  console.log("");

  for (const r of [c.newRegime, c.oldRegime]) {
    console.log(`  ${r.regimeLabel.toUpperCase()}`);
    row("Standard deduction", inr(r.standardDeduction));
    row("HRA exemption", inr(r.hraExemption));
    row("Chapter VI-A deductions", inr(r.chapterVIA));
    row("Taxable income", inr(r.taxableIncome));
    for (const b of r.bands.filter((x) => x.taxInBand > 0)) {
      row(`  ${(b.rate * 100).toFixed(0)}% band`, `${inr(b.amountInBand)} taxed  ->  ${inr(b.taxInBand)}`);
    }
    row("Tax before rebate", inr(r.taxBeforeRebate));
    row("Section 87A rebate", r.rebate87A > 0 ? "-" + inr(r.rebate87A) : inr(0));
    row("Cess at 4%", inr(r.cess));
    row("TOTAL TAX", inr(r.totalTax));
    console.log("");
  }

  console.log(`  RECOMMENDED: ${c.recommended === "new" ? "New Regime" : "Old Regime"}, saving ${inr(c.saving)}`);
  console.log("");

  if (p.occupation !== "salaried") {
    const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
    const expenses = p.income.businessExpensesAnnual ?? 0;
    const pres = presumptiveVsBooks({
      occupation: p.occupation,
      turnover,
      actualExpenses: expenses,
      digitalReceiptShare: p.income.digitalReceiptShare ?? 1,
    });
    console.log("  PRESUMPTIVE VS BOOKS");
    for (const o of pres.options) {
      row(o.method === "presumptive" ? `Section ${o.scheme}` : "Regular books",
          `${inr(o.declaredProfit)}   (${o.basis})`);
    }
    row("Recommended", pres.recommended);
    for (const cv of pres.caveats) console.log("      note: " + cv);
    console.log("");

    const gst = computeGST({
      domesticTurnover: p.income.domesticReceipts ?? turnover,
      exportTurnover: p.income.exportReceipts ?? 0,
      gstPaidOnExpenses: p.income.gstOnExpensesPaid ?? 0,
    });
    console.log("  GST");
    row("Output GST charged", inr(gst.outputGST));
    row("Input tax credit", inr(gst.inputTaxCredit));
    row("Net GST payable", inr(gst.netGSTPayable));
    row("Registration required", gst.registrationRequired ? "yes" : `no, ${inr(gst.headroomToThreshold)} of headroom`);
    console.log("");

    const adv = computeAdvanceTax({
      totalLiability: c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax,
      underPresumptiveScheme: pres.recommended === "presumptive",
    });
    console.log("  ADVANCE TAX");
    row("Required", adv.required ? "yes" : "no");
    for (const i of adv.instalments) row(`  by ${i.dueDate}`, inr(i.cumulativeAmount));
    console.log("");

    if (p.occupation === "profession") {
      const t = compute194J(p.income.domesticReceipts ?? p.income.grossReceiptsAnnual ?? 0);
      console.log("  SECTION 194J");
      row("Expected TDS by clients", inr(t.expectedTDS));
      row("Actually deducted", inr(p.income.tds194JDeducted ?? 0));
      console.log("");
    }
  }
}

bar();
console.log("Once checked, fill _meta.verification in data/tax_rules.json.");
console.log("");

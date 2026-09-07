/**
 * Prints every figure in the rulebook that a human must verify, with a blank
 * to tick. Nothing here is computed; these are the raw inputs the whole
 * project rests on.
 *
 *   npm run checklist
 */
import { RULES } from "../lib/kernel/rules";
import { inr } from "../lib/kernel/money";

let n = 0;
const item = (what: string, value: string, where: string) => {
  n++;
  console.log(`  [ ] ${String(n).padStart(2)}.  ${what.padEnd(52)} ${value.padEnd(16)} ${where}`);
};

console.log("");
console.log("RULEBOOK VERIFICATION CHECKLIST");
console.log(`FY ${RULES._meta.financialYear} · AY ${RULES._meta.assessmentYear} · ${RULES._meta.governingAct}`);
console.log("");
console.log("Check each figure against incometaxindia.gov.in (Tax Charts and Tables)");
console.log("and the calculator on incometax.gov.in. Tick as you go.");
console.log("");

for (const key of ["new", "old"] as const) {
  const r = RULES.regimes[key];
  console.log(`  ${r.label}`);
  item("Standard deduction (salaried)", inr(r.standardDeduction), "rate tables");
  r.slabs.forEach((s, i) => {
    const range = s.to === null ? `above ${inr(s.from)}` : `${inr(s.from)} to ${inr(s.to)}`;
    item(`Slab ${i + 1}: ${range}`, (s.rate * 100).toFixed(0) + "%", "rate tables");
  });
  item("87A rebate income threshold", inr(r.rebate87A.thresholdTaxableIncome), "section 87A");
  item("87A maximum rebate", inr(r.rebate87A.maxRebate), "section 87A");
  console.log("");
}

console.log("  Cess and deductions");
item("Health and education cess", (RULES.cess.rate * 100).toFixed(0) + "%", "rate tables");
for (const [sec, d] of Object.entries(RULES.deductions)) {
  item(`${sec} ceiling`, d.cap === null ? "no cap" : inr(d.cap), `section ${sec}`);
}
console.log("");

console.log("  HRA");
item("Metro rate (share of basic)", (RULES.hra.metroRate * 100).toFixed(0) + "%", "rule 2A");
item("Non-metro rate", (RULES.hra.nonMetroRate * 100).toFixed(0) + "%", "rule 2A");
item("Rent offset (share of basic)", (RULES.hra.rentOffsetRate * 100).toFixed(0) + "%", "rule 2A");
item("Metro city list", RULES.hra.metroCities.join(", "), "OPEN QUESTION");
console.log("");

console.log("  Presumptive taxation");
item("44AD deemed rate, digital receipts", (RULES.presumptive["44AD"].deemedRateDigital * 100).toFixed(0) + "%", "section 44AD");
item("44AD deemed rate, cash receipts", (RULES.presumptive["44AD"].deemedRateCash * 100).toFixed(0) + "%", "section 44AD");
item("44AD turnover ceiling", inr(RULES.presumptive["44AD"].turnoverCeiling), "section 44AD");
item("44ADA deemed rate", (RULES.presumptive["44ADA"].deemedRate * 100).toFixed(0) + "%", "section 44ADA");
item("44ADA receipts ceiling", inr(RULES.presumptive["44ADA"].receiptsCeiling), "section 44ADA");
console.log("");

console.log("  GST, TDS and advance tax");
item("GST service registration threshold", inr(RULES.gst.serviceRegistrationThreshold), "GST Act");
item("Standard GST rate on services", (RULES.gst.standardServiceRate * 100).toFixed(0) + "%", "GST rate schedule");
item("194J TDS rate", (RULES.tds["194J"].rate * 100).toFixed(0) + "%", "TDS rate chart");
item("Advance tax minimum liability", inr(RULES.advanceTax.minimumLiability), "section 208");
RULES.advanceTax.schedule.forEach((s) =>
  item(`Advance tax by ${s.dueDate}`, (s.cumulativePercent * 100).toFixed(0) + "%", "section 211")
);

console.log("");
console.log(`  ${n} figures to verify.`);
console.log("");
console.log("  Known gaps, deliberately not implemented:");
for (const g of RULES._gaps) console.log("    - " + g);
console.log("");

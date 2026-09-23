#!/usr/bin/env bash
# Corrects two rule-application errors found while preparing the evaluation:
#   1. Section 44AD: 6% only on digital receipts, 8% on the rest.
#   2. Section 194J: only clients in India deduct, so only domestic receipts count.
# Run from the repository root:   bash fix-rules.sh
set -euo pipefail

if [ ! -f package.json ] || ! grep -q '"name": "taxwise"' package.json; then
  echo "Run this from the taxwise folder (the one with package.json)."; exit 1
fi

cat > .fix-rules.js <<'FIX_JS_END'
// Applies the two rule corrections. Every edit names the exact text it
// replaces and stops if that text is not found exactly once, so it can never
// half-apply to a file that has drifted.
const fs = require("fs");

const edits = [
  // 1. 44AD: 6% only on digital receipts, 8% on the rest.
  ["lib/kernel/business.ts",
`  let scheme: string;
  let deemedRate: number;`,
`  let scheme: string;
  let deemedRate: number;
  let digitalPart = turnover;`],
  ["lib/kernel/business.ts",
`    scheme = "44AD";
    const digital = digitalReceiptShare >= 0.95;
    deemedRate = digital ? p["44AD"].deemedRateDigital : p["44AD"].deemedRateCash;
    ceiling = p["44AD"].turnoverCeiling;
    rateBasis = \`\${pct(deemedRate)} of turnover (\${digital ? "receipts are almost entirely digital" : "some receipts are in cash"})\`;
  }

  const deemedProfit = rupees(turnover * deemedRate);`,
`    scheme = "44AD";
    // Section 44AD(1): the lower rate applies only to the part of turnover
    // received through banking or electronic channels. Everything else is
    // deemed at the higher rate. A single rate for the whole turnover
    // understated profit whenever any receipt was not digital.
    const share = Math.min(1, Math.max(0, digitalReceiptShare));
    digitalPart = rupees(turnover * share);
    const cashPart = turnover - digitalPart;
    const rD = p["44AD"].deemedRateDigital;
    const rC = p["44AD"].deemedRateCash;
    deemedRate = turnover > 0 ? (digitalPart * rD + cashPart * rC) / turnover : rD;
    ceiling = p["44AD"].turnoverCeiling;
    rateBasis = cashPart > 0
      ? \`\${pct(rD)} of \${inr(digitalPart)} received digitally, plus \${pct(rC)} of \${inr(cashPart)} received otherwise\`
      : \`\${pct(rD)} of turnover, all of it received digitally\`;
  }

  const deemedProfit = scheme === "44AD"
    ? rupees(digitalPart * p["44AD"].deemedRateDigital) + rupees((turnover - digitalPart) * p["44AD"].deemedRateCash)
    : rupees(turnover * deemedRate);`],

  // 2. 194J: only clients in India deduct.
  ["lib/kernel/tools/registry.ts",
`      const receipts = p.income.grossReceiptsAnnual ?? 0;
      const t = compute194J(receipts);
      const actual = p.income.tds194JDeducted ?? 0;
      return {
        data: { applicable: true, ...t, actuallyDeducted: actual, grossReceipts: receipts, shortfall: t.expectedTDS - actual },
        facts: {
          grossReceipts: receipts,
          expectedTDS: t.expectedTDS,`,
`      // Section 194J obliges a payer in India. A client overseas deducts
      // nothing, so only domestic receipts are subject to it. Taking the rate
      // on gross receipts invented a shortfall for anyone with export income.
      const gross = p.income.grossReceiptsAnnual ?? 0;
      const receipts = p.income.domesticReceipts ?? gross;
      const t = compute194J(receipts);
      const actual = p.income.tds194JDeducted ?? 0;
      return {
        data: { applicable: true, ...t, actuallyDeducted: actual, grossReceipts: gross, domesticReceipts: receipts, shortfall: t.expectedTDS - actual },
        facts: {
          grossReceipts: gross,
          domesticReceipts: receipts,
          expectedTDS: t.expectedTDS,`],
  ["lib/agents/describe.ts",
`    case "compute_194j_tds":
      return f.applicable === "no"
        ? "Section 194J applies to professional fees, which does not apply here."
        : \`On receipts of \${inr(n(f, "grossReceipts"))}, clients should have deducted \${inr(n(f, "expectedTDS"))} under section 194J. \`
          + \`\${inr(n(f, "actuallyDeducted"))} was actually deducted, leaving \${inr(n(f, "shortfall"))} unaccounted for.\`;`,
`    case "compute_194j_tds": {
      if (f.applicable === "no") return "Section 194J applies to professional fees, which does not apply here.";
      const short = n(f, "shortfall");
      return \`Only clients in India deduct tax under section 194J. On \${inr(n(f, "domesticReceipts"))} from Indian clients, \`
        + \`\${inr(n(f, "expectedTDS"))} should have been deducted and \${inr(n(f, "actuallyDeducted"))} was. \`
        + (short > 0 ? \`Clients deducted \${inr(short)} less than expected.\`
          : short < 0 ? \`That is \${inr(-short)} more than expected, which comes back when you file.\`
          : "The two match, so nothing is missing.");
    }`],
  ["scripts/verify.ts",
`      const t = compute194J(p.income.grossReceiptsAnnual ?? 0);`,
`      const t = compute194J(p.income.domesticReceipts ?? p.income.grossReceiptsAnnual ?? 0);`],

  // Documentation that quotes the old figures.
  ["docs/MASTER_PLAN.md",
`declared profit ₹1,44,000 (6 percent, because receipts are digital)`,
`declared profit ₹1,46,400 (6 percent on the 95 percent received digitally, 8 percent on the rest)`],
  ["docs/MASTER_PLAN.md",
`**Section 194J:** ₹1,80,000 expected against ₹80,000 actually deducted.`,
`**Section 194J:** only Indian clients deduct, so ₹80,000 is expected on ₹8,00,000 of domestic receipts, matching the ₹80,000 actually deducted.`],
  ["README.md",
`Section 44AD deems **₹1,44,000** against`,
`Section 44AD deems **₹1,46,400** against`],
  ["README.md",
`Section 194J expected ₹1,80,000 against`,
`Section 194J expected ₹80,000 on domestic receipts, matching the`],
];

// Check everything first, then write. Nothing changes unless all edits fit.
const files = {};
for (const [file, from] of edits) {
  files[file] ??= fs.readFileSync(file, "utf8");
  const count = files[file].split(from).length - 1;
  if (count !== 1) {
    console.error(`\n  Stopped. Expected to find this text once in ${file}, found it ${count} times:\n\n${from.split("\n")[0]}\n\n  Nothing was changed.`);
    process.exit(1);
  }
}
for (const [file, from, to] of edits) files[file] = files[file].replace(from, () => to);
for (const [file, text] of Object.entries(files)) { fs.writeFileSync(file, text); console.log(`  updated ${file}`); }

fs.writeFileSync("tests/corrections.test.ts", `import { describe, it, expect } from "vitest";
import { presumptiveVsBooks } from "@/lib/kernel/business";
import { callTool } from "@/lib/kernel/tools/execute";

/**
 * Two corrections found while preparing independent expected answers for the
 * evaluation. Both were rule-application errors: the rates were right, but
 * applied to the wrong amounts.
 */
describe("44AD deems each part of turnover at its own rate", () => {
  it("gives Arjun 6% of his digital receipts plus 8% of the rest", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0.95 });
    expect(r.options[0].declaredProfit).toBe(136800 + 9600);
  });

  it("uses 6% on everything when every receipt is digital", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 1 });
    expect(r.options[0].declaredProfit).toBe(144000);
  });

  it("uses 8% on everything when no receipt is digital", () => {
    const r = presumptiveVsBooks({ occupation: "business", turnover: 2400000, actualExpenses: 900000, digitalReceiptShare: 0 });
    expect(r.options[0].declaredProfit).toBe(192000);
  });
});

describe("194J applies only to fees from clients in India", () => {
  it("expects Rohan's Indian clients to deduct 10% of his domestic receipts, with no shortfall", async () => {
    const r = await callTool({ agent: "computation", tool: "compute_194j_tds", ctx: { profileId: "ROHAN-003" } });
    expect(r.facts.domesticReceipts).toBe(800000);
    expect(r.facts.expectedTDS).toBe(80000);
    expect(r.facts.shortfall).toBe(0);
  });
});
`);
console.log("  added tests/corrections.test.ts");
FIX_JS_END

node .fix-rules.js
rm .fix-rules.js

echo ""
echo "Running the tests..."
npm test --silent
echo ""
echo "Done. Commit it:"
echo '  git add -A && git commit -m "Fix 44AD digital split and 194J domestic receipts" && git push'

/**
 * Ask the system a question from the terminal, with no interface involved.
 *
 *   npm run ask -- "which regime is better for me?"
 *   npm run ask -- --profile ARJUN-002 "how much GST do I owe?"
 */
import "../lib/env";
import { orchestrate } from "../lib/orchestrator";

async function main() {
  const argv = process.argv.slice(2);
  let profileId = "PRIYA-001";
  const i = argv.indexOf("--profile");
  if (i >= 0) { profileId = argv[i + 1]; argv.splice(i, 2); }
  const message = argv.join(" ").trim();

  if (!message) {
    console.log("");
    console.log('  Usage:  npm run ask -- "which regime is better for me?"');
    console.log('          npm run ask -- --profile ROHAN-003 "am I close to the GST threshold?"');
    console.log("");
    console.log("  Profiles: PRIYA-001 (salaried), ARJUN-002 (business), ROHAN-003 (freelance)");
    console.log("");
    return;
  }

  const r = await orchestrate({ message, profileId });

  console.log("");
  console.log(`  you    ${message}`);
  console.log("");
  console.log(`  route  ${r.route.agent}   (${r.route.reason}, ${r.route.ms}ms)`);
  console.log(`  agent  ${r.answer.agent} on ${r.answer.provider}`);
  console.log("");
  console.log("  " + r.answer.text.replace(/\n/g, "\n  "));
  console.log("");

  if (r.answer.toolResults.length) {
    console.log("  tools called");
    for (const t of r.answer.toolResults) {
      console.log(`    ${t.tool}  (${t.durationMs}ms)  renders as ${t.component}`);
      for (const [k, v] of Object.entries(t.facts)) console.log(`        ${k.padEnd(26)} ${v}`);
    }
    console.log("");
  }

  console.log("  steps");
  for (const s of r.answer.steps) {
    console.log(`    ${s.stage.padEnd(9)} ${(s.usedModel ? "model" : "no model").padEnd(9)} ${s.detail}`);
  }
  console.log("");
  console.log(`  guard  ${r.answer.guard.ok ? "passed" : "REJECTED: " + r.answer.guard.offending.join(", ")}`);
  if (r.answer.degraded) console.log("  note   deterministic phrasing was used");
  console.log(`  total  ${r.totalMs}ms`);
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

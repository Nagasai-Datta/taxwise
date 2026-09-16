/**
 * Prints the tool registry and the agent permission matrix.
 *
 *   npm run tools
 */
import "../lib/env";
import { TOOLS, TOOL_NAMES } from "../lib/kernel/tools/registry";
import { AGENT_REGISTRY, AGENT_IDS, mayCall } from "../lib/kernel/agents";

console.log("");
console.log("AGENTS");
console.log("");
for (const id of AGENT_IDS) {
  const a = AGENT_REGISTRY[id];
  console.log(`  ${a.name.padEnd(13)} ${a.provider.padEnd(12)} ${a.tools.length} tools`);
  console.log(`     handles: ${a.handles}`);
}

console.log("");
console.log("PERMISSION MATRIX");
console.log("");
const w = Math.max(...TOOL_NAMES.map((n) => n.length)) + 2;
console.log("  " + "tool".padEnd(w) + AGENT_IDS.map((i) => i.slice(0, 11).padEnd(13)).join(""));
console.log("  " + "-".repeat(w + 13 * AGENT_IDS.length));
for (const name of TOOL_NAMES.sort()) {
  const row = AGENT_IDS.map((id) => (mayCall(id, name) ? "yes" : "  .").padEnd(13)).join("");
  console.log("  " + name.padEnd(w) + row);
}

console.log("");
console.log("WHAT EACH TOOL RENDERS");
console.log("");
for (const name of TOOL_NAMES.sort()) {
  console.log(`  ${name.padEnd(w)} -> ${TOOLS[name].component}`);
}
console.log("");
console.log(`  ${TOOL_NAMES.length} tools. No tool accepts a rupee amount from the caller.`);
console.log("");

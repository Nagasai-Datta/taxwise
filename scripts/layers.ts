import { LAYERS, AGENTS } from "../lib/layers";
console.log("\nLayers\n");
for (const l of LAYERS) {
  console.log(`  ${l.id}  ${l.name.padEnd(14)}${l.directory.padEnd(22)}phase ${l.phase}   ${l.status}`);
  console.log(`     ${l.owns}`);
}
console.log("\nAgents (phase 5)\n");
for (const a of AGENTS) console.log(`  ${a.name.padEnd(14)}${a.provider.padEnd(12)}${a.may}`);
console.log("");

/**
 * One poll of the always-on services, from the terminal.
 *
 *   npm run daemons
 *   npm run daemons -- --profile ARJUN-002
 */
import "../lib/env";
import { desc, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { auditLog } from "../lib/db/schema";
import { findProfile, listAccounts, listTransactions } from "../lib/db/repositories";
import { toTaxInput } from "../lib/kernel/profiles";
import { compareRegimes } from "../lib/kernel/regimes";
import {
  complianceObservations, monitorObservations, traceObservations, buildReport,
} from "../lib/kernel/daemons";

const MARK: Record<string, string> = { urgent: "!!", attention: " !", info: "  " };

/** The browser version reads these; the terminal version must too. */
async function recentCalls(profileId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select({
      toolName: auditLog.toolName, createdAt: auditLog.createdAt, durationMs: auditLog.durationMs,
    }).from(auditLog).where(eq(auditLog.profileId, profileId))
      .orderBy(desc(auditLog.createdAt)).limit(200);
  } catch {
    return [];
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--profile");
  const profileId = i >= 0 ? argv[i + 1] : "PRIYA-001";

  const p = await findProfile(profileId);
  if (!p) { console.error(`Unknown profile: ${profileId}`); process.exit(1); }

  const now = new Date();
  const accounts = await listAccounts(p.id);
  const tx = (await Promise.all(accounts.map((a) => listTransactions(a.id)))).flat();
  const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;

  const report = buildReport([
    ...complianceObservations({ occupation: p.occupation, gstRegistered: turnover > 2000000, now }),
    ...monitorObservations({
      occupation: p.occupation,
      transactions: tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant,
        category: t.category, occurredAt: t.occurredAt,
      })),
      turnover, deductions: p.deductions,
      regimeChosen: compareRegimes(toTaxInput(p)).recommended,
      now, since: null,
    }),
    ...traceObservations(await recentCalls(p.id), now),
  ], now);

  console.log("");
  console.log(`ALWAYS-ON SERVICES  ·  ${p.name}  ·  ${now.toLocaleString("en-IN")}`);
  console.log(`  ${report.counts.urgent} urgent, ${report.counts.attention} needing attention, ${report.counts.info} for information`);
  console.log("");
  let service = "";
  for (const o of report.observations) {
    if (o.service !== service) { service = o.service; console.log(`  ${service}`); }
    console.log(`    ${MARK[o.severity]}  ${o.title}`);
    console.log(`         ${o.detail}`);
    if (o.ask) console.log(`         ask: "${o.ask}"`);
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

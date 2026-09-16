/**
 * Confirms the database is reachable and reports what is in it.
 * Diagnoses the common failures rather than just failing.
 *
 *   npm run db:check
 */
import "../lib/env";
import { envStatus } from "../lib/env";
import { hasDatabase } from "../lib/db/client";
import { source, listProfiles, listAccounts, listTransactions, listGoals } from "../lib/db/repositories";
import { inr } from "../lib/kernel/money";

function diagnose() {
  const url = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  const problems: string[] = [];

  if (url.includes("[YOUR-PASSWORD]") || direct.includes("[YOUR-PASSWORD]"))
    problems.push("The placeholder [YOUR-PASSWORD] is still there. Replace it, brackets included, with your real database password.");
  if (url.includes("pgbouncer=true"))
    problems.push("DATABASE_URL ends with ?pgbouncer=true. Delete that part. It is a Prisma flag and postgres.js rejects it.");
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(url) || /@db\.[a-z0-9]+\.supabase\.co/.test(direct))
    problems.push("A 'Direct connection' string is being used. It is IPv6 only and will time out. Use the pooler strings from the Connect panel instead.");
  if (url && !url.includes(":6543"))
    problems.push("DATABASE_URL should use port 6543 (Transaction pooler).");
  if (direct && !direct.includes(":5432"))
    problems.push("DIRECT_URL should use port 5432 (Session pooler).");
  return problems;
}

async function main() {
  const env = envStatus();
  console.log("");
  console.log("  DATABASE_URL   " + env.DATABASE_URL);
  console.log("  DIRECT_URL     " + env.DIRECT_URL);
  console.log("");

  if (!hasDatabase()) {
    console.log("  No database configured. The application still works: every repository");
    console.log("  falls back to the seed fixtures, and the kernel needs no database at all.");
    console.log("");
    console.log("  To connect: open -e .env.local   and fill in both values.");
    console.log("");
    return;
  }

  const problems = diagnose();
  if (problems.length) {
    console.log("  Problems found in .env.local:");
    console.log("");
    for (const p of problems) console.log("    - " + p);
    console.log("");
  }

  const src = await source();
  if (src === "seed") {
    console.log("  The connection strings are set but the database could not be read.");
    if (!problems.length) {
      console.log("");
      console.log("  Nothing obviously wrong with the strings, so most likely the tables");
      console.log("  do not exist yet. Run:  npm run db:push");
    }
    console.log("");
    console.log("  Falling back to seed fixtures, so nothing is broken.");
    console.log("");
    return;
  }

  console.log("  Connected. Reading from Supabase.");
  console.log("");
  for (const p of await listProfiles()) {
    const accs = await listAccounts(p.id);
    const gls = await listGoals(p.id);
    let tx = 0;
    for (const a of accs) tx += (await listTransactions(a.id)).length;
    console.log(`  ${p.name.padEnd(7)} ${p.occupation.padEnd(11)} ${accs.length} account(s)  ${String(tx).padStart(4)} transactions  ${gls.length} goal(s)`);
    for (const a of accs) console.log(`      ${a.bankName.padEnd(24)} ${a.maskedNumber}  ${inr(a.balance).padStart(12)}  ${a.accountType}`);
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

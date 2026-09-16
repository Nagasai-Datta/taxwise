/**
 * Load the three fixtures into Supabase.
 *
 *   npm run db:push    creates the tables
 *   npm run db:seed    fills them
 *
 * Safe to run repeatedly: it clears and reloads rather than duplicating.
 */
import "../lib/env";
import { db, hasDatabase } from "../lib/db/client";
import { profiles, accounts, transactions, goals, memory } from "../lib/db/schema";
import { allProfiles } from "../lib/kernel/profiles";
import { inr } from "../lib/kernel/money";

const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Software", "Coworking"];

function seededTransactions(accountId: string, count: number, seed: number) {
  // Deterministic pseudo-random, so the same seed always gives the same rows.
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const rows = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(rnd() * 180);
    rows.push({
      accountId,
      amount: Math.round(200 + rnd() * 9800),
      direction: rnd() > 0.22 ? "debit" : "credit",
      merchant: ["Swiggy", "Uber", "Amazon", "Airtel", "Figma", "WeWork", "Zomato", "BESCOM"][Math.floor(rnd() * 8)],
      category: CATEGORIES[Math.floor(rnd() * CATEGORIES.length)],
      occurredAt: new Date(now - daysAgo * 86400000),
      source: "seeded",
    });
  }
  return rows;
}

async function main() {
  if (!hasDatabase()) {
    console.log("");
    console.log("  DATABASE_URL is not set, so there is nothing to seed.");
    console.log("  Copy .env.example to .env.local and fill in the two Supabase values.");
    console.log("");
    process.exit(1);
  }
  const d = db();
  if (!d) { console.error("Could not open a database connection."); process.exit(1); }

  console.log("");
  console.log("Seeding Supabase");
  console.log("");

  // Clearing profiles cascades to accounts, transactions, goals and memory.
  await d.delete(profiles);
  console.log("  cleared existing rows");

  for (const p of allProfiles()) {
    await d.insert(profiles).values({
      id: p.id, name: p.name, age: p.age, occupation: p.occupation,
      jobTitle: p.jobTitle, city: p.city, isMetro: p.isMetro,
      exercises: p.exercises, rentMonthly: p.rentMonthly,
      income: p.income, deductions: p.deductions,
    });

    const banks = [p.bank, ...(p.businessBank ? [p.businessBank] : [])];
    for (const b of banks) {
      const [acc] = await d.insert(accounts).values({
        profileId: p.id, bankName: b.name, maskedNumber: b.maskedNumber,
        balance: b.balance, accountType: b.type,
      }).returning();

      const n = b.type === "business" ? 120 : 90;
      const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + b.balance;
      await d.insert(transactions).values(seededTransactions(acc.id, n, seed));
      console.log(`  ${p.name.padEnd(6)} ${b.type.padEnd(9)} ${b.maskedNumber}  ${inr(b.balance).padStart(12)}  ${n} transactions`);
    }

    if (p.id === "ARJUN-002") {
      await d.insert(goals).values([
        { profileId: p.id, name: "Emergency fund", targetAmount: 500000, currentAmount: 180000, targetDate: "2027-03-31" },
        { profileId: p.id, name: "New equipment", targetAmount: 150000, currentAmount: 40000, targetDate: "2026-12-31" },
      ]);
    }
    if (p.id === "PRIYA-001") {
      await d.insert(goals).values([
        { profileId: p.id, name: "Emergency fund", targetAmount: 200000, currentAmount: 120000, targetDate: "2027-03-31" },
        { profileId: p.id, name: "Vacation", targetAmount: 100000, currentAmount: 30000, targetDate: "2026-12-31" },
      ]);
    }
    if (p.id === "ROHAN-003") {
      await d.insert(goals).values([
        { profileId: p.id, name: "Tax and GST reserve", targetAmount: 300000, currentAmount: 95000, targetDate: "2027-03-15" },
        { profileId: p.id, name: "Studio setup", targetAmount: 250000, currentAmount: 60000, targetDate: "2027-06-30" },
      ]);
    }

    await d.insert(memory).values({ profileId: p.id, dossier: { preferences: [], decisions: [], openQuestions: [], facts: [] } });
  }

  console.log("");
  console.log("  Done. Run 'npm run db:check' to confirm.");
  console.log("");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

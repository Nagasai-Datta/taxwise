import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, transactions } from "@/lib/db/schema";
import { listProfiles } from "@/lib/db/repositories";
import { validatePayment, planPayment, reference, type AccountLike } from "@/lib/kernel/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gateway's own API.
 *
 * It writes transaction rows and updates balances. Nothing here reads or
 * touches anything the main application owns beyond that one table, which is
 * the whole point of keeping it separate: the main application only reads.
 */

async function allAccounts(): Promise<AccountLike[]> {
  const d = db();
  if (!d) return [];
  const profiles = await listProfiles();
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));
  try {
    const rows = await d.select().from(accounts);
    return rows.map((a) => ({
      id: a.id, profileId: a.profileId, bankName: a.bankName,
      maskedNumber: a.maskedNumber, balance: a.balance, accountType: a.accountType,
      ownerName: nameById.get(a.profileId) ?? a.profileId,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const list = await allAccounts();
  return NextResponse.json({
    accounts: list,
    connected: list.length > 0,
  });
}

export async function POST(req: Request) {
  const d = db();
  if (!d) {
    return NextResponse.json(
      { error: "No database is connected, so there is nowhere to record a payment." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const request = {
    action: body.action,
    amount: Math.trunc(Number(String(body.amount ?? "").toString().replace(/[,\s\u20B9]/g, ""))),
    toAccountId: String(body.toAccountId ?? ""),
    fromAccountId: body.fromAccountId ? String(body.fromAccountId) : undefined,
    note: body.note ? String(body.note).slice(0, 60) : undefined,
  };

  const list = await allAccounts();
  const problems = validatePayment(request, list);
  if (problems.length > 0) return NextResponse.json({ problems }, { status: 400 });

  const plan = planPayment(request, list);
  const now = new Date();

  try {
    /**
     * Both sides of a transfer, and the balances, in one transaction. A
     * transfer that debited one account and then failed before crediting the
     * other would be worse than one that never happened.
     */
    await d.transaction(async (tx) => {
      for (const e of plan.entries) {
        await tx.insert(transactions).values({
          accountId: e.accountId, amount: e.amount, direction: e.direction,
          merchant: e.merchant, category: e.category, occurredAt: now, source: e.source,
        });
      }
      for (const b of plan.balanceChanges) {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${b.delta}` })
          .where(eq(accounts.id, b.accountId));
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The payment could not be recorded." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reference: reference(now, request.amount),
    summary: plan.summary,
    at: now.toISOString(),
    balanceChanges: plan.balanceChanges,
    accounts: await allAccounts(),
  });
}

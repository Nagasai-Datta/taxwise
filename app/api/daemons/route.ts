import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { findProfile, listAccounts, listTransactions } from "@/lib/db/repositories";
import { toTaxInput } from "@/lib/kernel/profiles";
import { compareRegimes } from "@/lib/kernel/regimes";
import {
  complianceObservations, monitorObservations, traceObservations, buildReport,
} from "@/lib/kernel/daemons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One poll of the always-on services.
 *
 * The browser calls this on an interval. Nothing runs on a server timer,
 * because a background job that outlives a request is not something this
 * project needs and would be the only piece of the system that cannot be
 * reproduced by re-running a command.
 *
 * `since` is the time of the caller's previous poll, so the monitor can report
 * what is new rather than what exists.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") ?? "";
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const now = new Date();

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const p = await findProfile(profileId);
  if (!p) return NextResponse.json({ error: "unknown profile" }, { status: 404 });

  const accounts = await listAccounts(profileId);
  const tx = (await Promise.all(accounts.map((a) => listTransactions(a.id)))).flat();
  const turnover = p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0;
  const gstRegistered = turnover > 2000000;
  const regime = compareRegimes(toTaxInput(p)).recommended;

  let auditRows: { toolName: string; createdAt: Date; durationMs: number }[] = [];
  const d = db();
  if (d) {
    try {
      auditRows = await d.select({
        toolName: auditLog.toolName, createdAt: auditLog.createdAt, durationMs: auditLog.durationMs,
      }).from(auditLog).where(eq(auditLog.profileId, profileId))
        .orderBy(desc(auditLog.createdAt)).limit(200);
    } catch { auditRows = []; }
  }

  const report = buildReport([
    ...complianceObservations({ occupation: p.occupation, gstRegistered, now }),
    ...monitorObservations({
      occupation: p.occupation,
      transactions: tx.map((t) => ({
        amount: t.amount, direction: t.direction, merchant: t.merchant,
        category: t.category, occurredAt: t.occurredAt,
      })),
      turnover,
      deductions: p.deductions,
      regimeChosen: regime,
      now, since,
    }),
    ...traceObservations(auditRows, now),
  ], now);

  return NextResponse.json({
    ...report,
    services: [
      { id: "calendar", label: "Compliance calendar", what: "Watches the statutory dates that apply to you." },
      { id: "monitor", label: "Proactive monitor", what: "Watches your transactions, turnover and unused headroom." },
      { id: "trace", label: "Verifiable trace", what: "Records every calculation the system performs." },
    ],
  });
}

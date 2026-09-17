import { RULES } from "./rules";
import { getApplicableDeadlines } from "./business";
import { categorizeSpending, type TxLike } from "./management";
import { inr } from "./money";
import type { Occupation } from "./types";

/**
 * The always-on services.
 *
 * Everything else in this system answers a question. These notice things
 * nobody asked about: a deadline approaching, turnover creeping towards the
 * GST threshold, a month that cost more than usual, deduction headroom that
 * expires with the financial year.
 *
 * Each is a pure function over data the system already holds. They run on a
 * poll rather than continuously, they produce observations rather than
 * actions, and none of them can produce a figure the rule engine did not,
 * because each one calls it.
 *
 * An observation is not advice. It states what is true and, where useful,
 * names the question to ask about it.
 */

export type Severity = "info" | "attention" | "urgent";

export interface Observation {
  id: string;
  service: "calendar" | "monitor" | "trace";
  severity: Severity;
  title: string;
  detail: string;
  /** A question the user can ask to look into it. */
  ask?: string;
  /** Sorts within a service. Lower is more pressing. */
  order: number;
}

export interface DaemonReport {
  observations: Observation[];
  ranAt: string;
  counts: Record<Severity, number>;
}

/* ------------------------------------------------- 1. compliance calendar */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * "15 Jun" is a date without a year. The financial year runs April to March,
 * so a month before April belongs to the following calendar year.
 */
export function nextOccurrence(dateLabel: string, now: Date): Date | null {
  const m = dateLabel.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;

  let year = now.getFullYear();
  const candidate = new Date(year, month, day);
  if (candidate.getTime() < now.getTime()) year += 1;
  return new Date(year, month, day);
}

export function daysUntil(d: Date, now: Date): number {
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

export function complianceObservations(args: {
  occupation: Occupation;
  gstRegistered: boolean;
  now: Date;
  /** Anything further out than this is not worth interrupting anyone about. */
  horizonDays?: number;
}): Observation[] {
  const horizon = args.horizonDays ?? 60;
  const out: Observation[] = [];

  for (const e of getApplicableDeadlines({ occupation: args.occupation, gstRegistered: args.gstRegistered })) {
    const when = nextOccurrence(e.date, args.now);
    if (!when) continue;                      // monthly items such as "11th of each month"
    const days = daysUntil(when, args.now);
    if (days > horizon) continue;

    out.push({
      id: `cal.${e.id}`,
      service: "calendar",
      severity: days <= 7 ? "urgent" : days <= 30 ? "attention" : "info",
      title: e.label,
      detail: days === 0 ? "Due today."
        : days === 1 ? "Due tomorrow."
        : `Due in ${days} days, on ${when.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.`,
      ask: "When do I need to file?",
      order: days,
    });
  }
  return out;
}

/* ------------------------------------------------- 2. proactive monitor */

export function monitorObservations(args: {
  occupation: Occupation;
  transactions: TxLike[];
  /** Turnover so far this year, for the GST threshold watch. */
  turnover: number;
  /** Deductions claimed so far, by section. */
  deductions: Record<string, number>;
  regimeChosen: "new" | "old";
  now: Date;
  /** Anything after this is new since the last poll. */
  since?: Date | null;
}): Observation[] {
  const out: Observation[] = [];
  const { transactions: tx, now } = args;

  /* new movement since the last poll */
  if (args.since) {
    const fresh = tx.filter((t) => new Date(t.occurredAt).getTime() > args.since!.getTime());
    if (fresh.length > 0) {
      const spent = fresh.filter((t) => t.direction === "debit").reduce((n, t) => n + t.amount, 0);
      const received = fresh.filter((t) => t.direction === "credit").reduce((n, t) => n + t.amount, 0);
      out.push({
        id: "mon.new",
        service: "monitor",
        severity: "info",
        title: `${fresh.length} new transaction${fresh.length === 1 ? "" : "s"}`,
        detail: `${inr(spent)} out and ${inr(received)} in since the last check.`,
        ask: "Show my recent transactions",
        order: 0,
      });
    }
  }

  /* a payment well outside the usual size */
  const debits = tx.filter((t) => t.direction === "debit");
  if (debits.length >= 10) {
    const amounts = debits.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const recent = debits
      .filter((t) => daysUntil(new Date(t.occurredAt), now) > -30)
      .filter((t) => t.amount > median * 6);
    if (recent.length > 0) {
      const biggest = recent.sort((a, b) => b.amount - a.amount)[0];
      out.push({
        id: "mon.large",
        service: "monitor",
        severity: "attention",
        title: "An unusually large payment",
        detail: `${inr(biggest.amount)} to ${biggest.merchant}, against a typical payment of about ${inr(median)}.`,
        ask: "How much did I spend?",
        order: 1,
      });
    }
  }

  /* turnover approaching the point where registration becomes compulsory */
  if (args.occupation !== "salaried") {
    const threshold = RULES.gst.serviceRegistrationThreshold;
    const headroom = threshold - args.turnover;
    if (args.turnover > threshold) {
      out.push({
        id: "mon.gst.over",
        service: "monitor",
        severity: "urgent",
        title: "Above the GST registration threshold",
        detail: `Turnover of ${inr(args.turnover)} is past ${inr(threshold)}, so registration is compulsory.`,
        ask: "How much GST do I owe?",
        order: 0,
      });
    } else if (headroom < threshold * 0.2) {
      out.push({
        id: "mon.gst.near",
        service: "monitor",
        severity: "attention",
        title: "Approaching the GST threshold",
        detail: `${inr(headroom)} of turnover left before registration becomes compulsory.`,
        ask: "Am I close to the GST threshold?",
        order: 2,
      });
    }
  }

  /* deduction headroom that expires with the financial year */
  if (args.regimeChosen === "old") {
    const cap80C = RULES.deductions["80C"].cap ?? 0;
    const used = args.deductions["80C"] ?? 0;
    const headroom = cap80C - used;
    const yearEnd = nextOccurrence("31 Mar", now);
    const daysLeft = yearEnd ? daysUntil(yearEnd, now) : 999;
    if (headroom > 0 && daysLeft <= 120) {
      out.push({
        id: "mon.80c",
        service: "monitor",
        severity: daysLeft <= 30 ? "attention" : "info",
        title: "Unused 80C headroom",
        detail: `${inr(headroom)} of the ${inr(cap80C)} ceiling is unused, and it does not carry into next year. ${daysLeft} days left.`,
        ask: "How can I pay less tax?",
        order: 3,
      });
    }
  }

  /* spending running ahead of what is coming in */
  const c = categorizeSpending(tx);
  if (c.totalReceived > 0 && c.totalSpent > c.totalReceived * 1.1) {
    out.push({
      id: "mon.outflow",
      service: "monitor",
      severity: "attention",
      title: "Spending is ahead of receipts",
      detail: `${inr(c.totalSpent)} out against ${inr(c.totalReceived)} in, across these accounts.`,
      ask: "What is my savings rate?",
      order: 4,
    });
  }

  return out;
}

/* ---------------------------------------------------- 3. verifiable trace */

export interface TraceSummaryInput {
  toolName: string;
  createdAt: string | Date;
  durationMs: number;
}

/** "today", "yesterday", or a day count. A bare "0 day(s) ago" reads badly. */
export function ago(then: Date, now: Date): string {
  const days = Math.abs(daysUntil(then, now));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function traceObservations(rows: TraceSummaryInput[], now: Date): Observation[] {
  if (rows.length === 0) {
    return [{
      id: "trace.empty",
      service: "trace",
      severity: "info",
      title: "Nothing computed yet",
      detail: "Every calculation this system performs is recorded here, one entry per call. Ask something and it will fill in.",
      order: 0,
    }];
  }

  const byTool = new Map<string, number>();
  for (const r of rows) byTool.set(r.toolName, (byTool.get(r.toolName) ?? 0) + 1);
  const top = [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const slowest = [...rows].sort((a, b) => b.durationMs - a.durationMs)[0];
  const last = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  return [
    {
      id: "trace.count",
      service: "trace",
      severity: "info",
      title: `${rows.length} calculation${rows.length === 1 ? "" : "s"} recorded`,
      detail: `Across ${byTool.size} different tool${byTool.size === 1 ? "" : "s"}. `
        + `Most used: ${top.map(([t, n]) => `${t} (${n})`).join(", ")}.`,
      order: 0,
    },
    {
      id: "trace.last",
      service: "trace",
      severity: "info",
      title: "Most recent",
      detail: `${last.toolName}, ${ago(new Date(last.createdAt), now)}, in ${last.durationMs}ms.`,
      order: 1,
    },
    {
      id: "trace.slowest",
      service: "trace",
      severity: "info",
      title: "Slowest call on record",
      detail: `${slowest.toolName} at ${slowest.durationMs}ms. Every figure the system has shown came through one of these.`,
      order: 2,
    },
  ];
}

/* ------------------------------------------------------------- assembly */

export function buildReport(observations: Observation[], now: Date): DaemonReport {
  const sorted = [...observations].sort((a, b) => {
    const rank: Record<Severity, number> = { urgent: 0, attention: 1, info: 2 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return a.order - b.order;
  });
  return {
    observations: sorted,
    ranAt: now.toISOString(),
    counts: {
      urgent: sorted.filter((o) => o.severity === "urgent").length,
      attention: sorted.filter((o) => o.severity === "attention").length,
      info: sorted.filter((o) => o.severity === "info").length,
    },
  };
}

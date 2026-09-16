import type { TraceNode } from "./types";
import { inr, pct, rupees } from "./money";

/**
 * Money management arithmetic.
 *
 * Same rule as the tax engine: these are pure functions with no network and
 * no model, and each emits a trace as it computes.
 */

export interface AccountLike { bankName: string; maskedNumber: string; balance: number; accountType: string }
export interface TxLike { amount: number; direction: string; merchant: string; category: string; occurredAt: Date | string }

/* -------------------------------------------------------------- net worth */
export function computeNetWorth(accounts: AccountLike[]): { total: number; byAccount: AccountLike[]; trace: TraceNode } {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return {
    total,
    byAccount: accounts,
    trace: {
      ruleId: "management.net_worth",
      label: `Net worth is the sum of the balances across ${accounts.length} connected account${accounts.length === 1 ? "" : "s"}`,
      inputs: { accountCount: accounts.length },
      output: total,
      children: accounts.map((a, i) => ({
        ruleId: `management.net_worth.account[${i}]`,
        label: `${a.bankName} ${a.maskedNumber} (${a.accountType})`,
        inputs: {},
        output: a.balance,
      })),
    },
  };
}

/* --------------------------------------------------------- categorisation */
export interface CategoryTotal { category: string; total: number; count: number; share: number }

export function categorizeSpending(transactions: TxLike[]): {
  totalSpent: number;
  totalReceived: number;
  categories: CategoryTotal[];
  trace: TraceNode;
} {
  const debits = transactions.filter((t) => t.direction === "debit");
  const credits = transactions.filter((t) => t.direction === "credit");
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0);
  const totalReceived = credits.reduce((s, t) => s + t.amount, 0);

  const map = new Map<string, { total: number; count: number }>();
  for (const t of debits) {
    const e = map.get(t.category) ?? { total: 0, count: 0 };
    e.total += t.amount;
    e.count += 1;
    map.set(t.category, e);
  }

  const categories: CategoryTotal[] = [...map.entries()]
    .map(([category, e]) => ({
      category,
      total: e.total,
      count: e.count,
      share: totalSpent > 0 ? e.total / totalSpent : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalSpent,
    totalReceived,
    categories,
    trace: {
      ruleId: "management.categorise",
      label: `${debits.length} outgoing transactions grouped into ${categories.length} categories`,
      inputs: { transactionCount: transactions.length },
      output: totalSpent,
      children: categories.map((c, i) => ({
        ruleId: `management.categorise.${c.category}`,
        label: `${c.category}: ${c.count} transactions, ${pct(c.share)} of spending`,
        inputs: { count: c.count },
        output: c.total,
      })),
    },
  };
}

/* ------------------------------------------------------------ savings rate */
export function computeSavingsRate(args: { netIncome: number; totalSpent: number }): {
  saved: number; rate: number; trace: TraceNode;
} {
  const saved = Math.max(0, rupees(args.netIncome - args.totalSpent));
  const rate = args.netIncome > 0 ? saved / args.netIncome : 0;
  return {
    saved,
    rate,
    trace: {
      ruleId: "management.savings_rate",
      label: `Savings rate is what remains of net income after spending, as a share of net income`,
      inputs: { netIncome: args.netIncome, totalSpent: args.totalSpent },
      output: saved,
      children: [{
        ruleId: "management.savings_rate.percent",
        label: `${inr(saved)} saved out of ${inr(args.netIncome)} is ${pct(rate)}`,
        inputs: {},
        output: Math.round(rate * 10000) / 100,
      }],
    },
  };
}

/* ---------------------------------------------------------- goal progress */
export interface GoalLike { name: string; targetAmount: number; currentAmount: number; targetDate?: string | null }

export function computeGoalProgress(goals: GoalLike[], monthlySaving: number): {
  goals: (GoalLike & { progress: number; remaining: number; monthsToTarget: number | null })[];
  trace: TraceNode;
} {
  const out = goals.map((g) => {
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    return {
      ...g,
      progress: g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0,
      remaining,
      monthsToTarget: monthlySaving > 0 ? Math.ceil(remaining / monthlySaving) : null,
    };
  });

  return {
    goals: out,
    trace: {
      ruleId: "management.goal_progress",
      label: `Progress against ${goals.length} goal${goals.length === 1 ? "" : "s"}`,
      inputs: { monthlySaving },
      output: out.reduce((s, g) => s + g.currentAmount, 0),
      children: out.map((g) => ({
        ruleId: `management.goal.${g.name.replace(/\s+/g, "_").toLowerCase()}`,
        label: g.monthsToTarget === null
          ? `${g.name}: ${pct(g.progress)} funded, ${inr(g.remaining)} to go`
          : `${g.name}: ${pct(g.progress)} funded, ${inr(g.remaining)} to go, about ${g.monthsToTarget} months at the current savings rate`,
        inputs: { target: g.targetAmount },
        output: g.currentAmount,
      })),
    },
  };
}

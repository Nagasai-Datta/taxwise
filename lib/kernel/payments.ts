import { inr } from "./money";

/**
 * The payments gateway.
 *
 * A separate application in every sense that matters: its own route, its own
 * look, its own vocabulary. It writes a transaction row and updates a balance.
 * The main application only ever reads that table.
 *
 * That separation is the point. An application that can see a bank but not
 * touch it is how India's Account Aggregator framework works, and it is what
 * makes the proactive monitor demonstrable: money moves in one window, the
 * monitor notices in the other, and nothing in the main application had to be
 * told.
 *
 * The money is fake. Everything else about the flow is real.
 */

export type PaymentAction = "add" | "transfer";

export interface AccountLike {
  id: string;
  profileId: string;
  bankName: string;
  maskedNumber: string;
  balance: number;
  accountType: string;
  ownerName?: string;
}

export interface PaymentRequest {
  action: PaymentAction;
  amount: number;
  toAccountId: string;
  fromAccountId?: string;
  note?: string;
}

export interface PaymentProblem {
  field: "amount" | "from" | "to" | "action";
  message: string;
}

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 1000000;

/**
 * Everything that can be wrong with a payment, returned together.
 *
 * All of it at once rather than the first failure, because a form that reveals
 * one problem per attempt is worse than one that reveals all of them.
 */
export function validatePayment(
  req: PaymentRequest,
  accounts: AccountLike[]
): PaymentProblem[] {
  const problems: PaymentProblem[] = [];
  const to = accounts.find((a) => a.id === req.toAccountId);
  const from = req.fromAccountId ? accounts.find((a) => a.id === req.fromAccountId) : undefined;

  if (req.action !== "add" && req.action !== "transfer") {
    problems.push({ field: "action", message: "Choose whether to add funds or send them." });
  }

  if (!Number.isFinite(req.amount) || !Number.isInteger(req.amount)) {
    problems.push({ field: "amount", message: "Enter a whole rupee amount." });
  } else if (req.amount < MIN_AMOUNT) {
    problems.push({ field: "amount", message: `The smallest amount is ${inr(MIN_AMOUNT)}.` });
  } else if (req.amount > MAX_AMOUNT) {
    problems.push({ field: "amount", message: `The largest amount is ${inr(MAX_AMOUNT)} in one go.` });
  }

  if (!to) {
    problems.push({ field: "to", message: "Choose an account to receive the money." });
  }

  if (req.action === "transfer") {
    if (!from) {
      problems.push({ field: "from", message: "Choose an account to send from." });
    } else if (from.id === req.toAccountId) {
      problems.push({ field: "to", message: "Sending to the same account would do nothing." });
    } else if (Number.isFinite(req.amount) && req.amount > from.balance) {
      problems.push({
        field: "amount",
        message: `${from.bankName} ${from.maskedNumber} holds ${inr(from.balance)}, which is less than that.`,
      });
    }
  }

  return problems;
}

export interface LedgerEntry {
  accountId: string;
  amount: number;
  direction: "debit" | "credit";
  merchant: string;
  category: string;
  source: string;
}

export interface PaymentPlan {
  entries: LedgerEntry[];
  balanceChanges: { accountId: string; delta: number; from: number; to: number }[];
  summary: string;
}

/**
 * What a payment does, worked out before anything is written.
 *
 * A transfer is two entries, never one: money leaves an account and arrives at
 * another, and both sides are recorded. Adding funds is a single credit, which
 * is the one place money enters the system from nowhere, and it is labelled as
 * such so it is never mistaken for income.
 */
export function planPayment(req: PaymentRequest, accounts: AccountLike[]): PaymentPlan {
  const to = accounts.find((a) => a.id === req.toAccountId)!;
  const from = req.fromAccountId ? accounts.find((a) => a.id === req.fromAccountId) : undefined;
  const note = (req.note ?? "").trim();

  if (req.action === "add") {
    return {
      entries: [{
        accountId: to.id, amount: req.amount, direction: "credit",
        merchant: note || "Added funds", category: "Transfer in", source: "gateway",
      }],
      balanceChanges: [{ accountId: to.id, delta: req.amount, from: to.balance, to: to.balance + req.amount }],
      summary: `${inr(req.amount)} added to ${to.bankName} ${to.maskedNumber}.`,
    };
  }

  const who = (a: AccountLike) => a.ownerName ?? a.bankName;
  return {
    entries: [
      {
        accountId: from!.id, amount: req.amount, direction: "debit",
        merchant: note || `To ${who(to)}`, category: "Transfer out", source: "gateway",
      },
      {
        accountId: to.id, amount: req.amount, direction: "credit",
        merchant: note || `From ${who(from!)}`, category: "Transfer in", source: "gateway",
      },
    ],
    balanceChanges: [
      { accountId: from!.id, delta: -req.amount, from: from!.balance, to: from!.balance - req.amount },
      { accountId: to.id, delta: req.amount, from: to.balance, to: to.balance + req.amount },
    ],
    summary: `${inr(req.amount)} sent from ${who(from!)} to ${who(to)}.`,
  };
}

/** A reference a person could read out, stable for one payment. */
export function reference(now: Date, amount: number): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(2, 14);
  return `TW${stamp}${String(amount % 1000).padStart(3, "0")}`;
}

import { describe, it, expect } from "vitest";
import {
  validatePayment, planPayment, reference, MIN_AMOUNT, MAX_AMOUNT, type AccountLike,
} from "@/lib/kernel/payments";

const ACCOUNTS: AccountLike[] = [
  { id: "a1", profileId: "PRIYA-001", bankName: "HDFC Bank", maskedNumber: "XXXXXX1234", balance: 240000, accountType: "personal", ownerName: "Priya" },
  { id: "a2", profileId: "ARJUN-002", bankName: "ICICI Bank", maskedNumber: "XXXXXX5678", balance: 450000, accountType: "personal", ownerName: "Arjun" },
  { id: "a3", profileId: "ROHAN-003", bankName: "Axis Bank", maskedNumber: "XXXXXX9012", balance: 180000, accountType: "personal", ownerName: "Rohan" },
];

const transfer = (over: Record<string, unknown> = {}) =>
  ({ action: "transfer" as const, amount: 5000, fromAccountId: "a1", toAccountId: "a2", ...over });

describe("what a payment may not do", () => {
  it("accepts a straightforward transfer", () => {
    expect(validatePayment(transfer(), ACCOUNTS)).toHaveLength(0);
  });

  it("refuses more than the sending account holds", () => {
    const p = validatePayment(transfer({ amount: 300000 }), ACCOUNTS);
    expect(p.map((x) => x.field)).toContain("amount");
    expect(p[0].message).toMatch(/holds/i);
  });

  it("refuses a transfer to the same account", () => {
    const p = validatePayment(transfer({ toAccountId: "a1" }), ACCOUNTS);
    expect(p.map((x) => x.message).join(" ")).toMatch(/same account/i);
  });

  it("refuses an amount below the minimum or above the maximum", () => {
    expect(validatePayment(transfer({ amount: MIN_AMOUNT - 1 }), ACCOUNTS).length).toBeGreaterThan(0);
    expect(validatePayment(transfer({ amount: MAX_AMOUNT + 1 }), ACCOUNTS).length).toBeGreaterThan(0);
  });

  it("refuses a fractional amount", () => {
    expect(validatePayment(transfer({ amount: 12.5 }), ACCOUNTS).length).toBeGreaterThan(0);
  });

  it("refuses an account that does not exist", () => {
    expect(validatePayment(transfer({ toAccountId: "nope" }), ACCOUNTS).map((x) => x.field)).toContain("to");
    expect(validatePayment(transfer({ fromAccountId: "nope" }), ACCOUNTS).map((x) => x.field)).toContain("from");
  });

  it("reports every problem at once, not the first one", () => {
    const p = validatePayment(transfer({ amount: -5, toAccountId: "nope" }), ACCOUNTS);
    expect(p.length).toBeGreaterThanOrEqual(2);
  });

  it("does not ask adding funds where the money comes from", () => {
    expect(validatePayment({ action: "add", amount: 10000, toAccountId: "a1" }, ACCOUNTS)).toHaveLength(0);
  });

  it("lets adding funds exceed the balance, since that is the point", () => {
    expect(validatePayment({ action: "add", amount: 999999, toAccountId: "a3" }, ACCOUNTS)).toHaveLength(0);
  });
});

describe("what a payment does", () => {
  it("writes both sides of a transfer, never one", () => {
    const plan = planPayment(transfer({ amount: 25000 }), ACCOUNTS);
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries.map((e) => e.direction).sort()).toEqual(["credit", "debit"]);
    expect(plan.entries.every((e) => e.source === "gateway")).toBe(true);
  });

  it("moves the same amount out of one and into the other", () => {
    const plan = planPayment(transfer({ amount: 25000 }), ACCOUNTS);
    const deltas = plan.balanceChanges.map((b) => b.delta).sort((a, b) => a - b);
    expect(deltas).toEqual([-25000, 25000]);
    expect(deltas[0] + deltas[1]).toBe(0);
  });

  it("names the other person on each side, so a statement reads sensibly", () => {
    const plan = planPayment(transfer(), ACCOUNTS);
    const debit = plan.entries.find((e) => e.direction === "debit")!;
    const credit = plan.entries.find((e) => e.direction === "credit")!;
    expect(debit.merchant).toMatch(/Arjun/);
    expect(credit.merchant).toMatch(/Priya/);
  });

  it("uses the note in place of the generated description", () => {
    const plan = planPayment(transfer({ note: "Rent for September" }), ACCOUNTS);
    expect(plan.entries.every((e) => e.merchant === "Rent for September")).toBe(true);
  });

  it("writes one credit when adding funds, and labels where it came from", () => {
    const plan = planPayment({ action: "add", amount: 10000, toAccountId: "a1" }, ACCOUNTS);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].direction).toBe("credit");
    expect(plan.entries[0].category).toBe("Transfer in");
  });

  it("categorises so the monitor does not read a transfer as income", () => {
    const plan = planPayment(transfer(), ACCOUNTS);
    expect(plan.entries.map((e) => e.category).sort()).toEqual(["Transfer in", "Transfer out"]);
  });

  it("reports the balances before and after", () => {
    const plan = planPayment(transfer({ amount: 40000 }), ACCOUNTS);
    const out = plan.balanceChanges.find((b) => b.accountId === "a1")!;
    expect(out.from).toBe(240000);
    expect(out.to).toBe(200000);
  });
});

describe("the reference", () => {
  it("is stable for one payment and readable aloud", () => {
    const at = new Date(2026, 8, 17, 14, 30);
    expect(reference(at, 5000)).toBe(reference(at, 5000));
    expect(reference(at, 5000)).toMatch(/^TW\d+$/);
  });
});

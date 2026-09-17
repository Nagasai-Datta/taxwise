import { describe, it, expect } from "vitest";
import {
  nextOccurrence, daysUntil, complianceObservations,
  monitorObservations, traceObservations, buildReport,
} from "@/lib/kernel/daemons";
import { RULES } from "@/lib/kernel/rules";

const NOW = new Date(2026, 8, 17);   // 17 September 2026

describe("reading a date that has no year on it", () => {
  it("takes the next occurrence, not the past one", () => {
    const d = nextOccurrence("15 Dec", NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
  });

  it("rolls into the following year once the date has passed", () => {
    const d = nextOccurrence("15 Jun", NOW)!;
    expect(d.getFullYear()).toBe(2027);
  });

  it("ignores a recurring label it cannot resolve", () => {
    expect(nextOccurrence("11th of each month", NOW)).toBeNull();
    expect(nextOccurrence("", NOW)).toBeNull();
  });

  it("counts whole days", () => {
    expect(daysUntil(new Date(2026, 8, 24), NOW)).toBe(7);
  });
});

describe("the compliance calendar", () => {
  it("raises nothing beyond the horizon", () => {
    const o = complianceObservations({ occupation: "salaried", gstRegistered: false, now: NOW, horizonDays: 5 });
    for (const x of o) expect(x.order).toBeLessThanOrEqual(5);
  });

  it("escalates as a date approaches", () => {
    const soon = new Date(2026, 11, 12);   // three days before 15 Dec
    const o = complianceObservations({ occupation: "business", gstRegistered: false, now: soon });
    const adv = o.find((x) => x.id === "cal.adv_q3");
    expect(adv?.severity).toBe("urgent");
  });

  it("never shows a salaried user advance tax dates", () => {
    const o = complianceObservations({ occupation: "salaried", gstRegistered: false, now: NOW, horizonDays: 400 });
    expect(o.some((x) => x.id.startsWith("cal.adv_"))).toBe(false);
  });

  it("shows a business advance tax dates", () => {
    const o = complianceObservations({ occupation: "business", gstRegistered: false, now: NOW, horizonDays: 400 });
    expect(o.some((x) => x.id.startsWith("cal.adv_"))).toBe(true);
  });
});

describe("the proactive monitor", () => {
  const base = {
    occupation: "profession" as const,
    transactions: [],
    turnover: 0,
    deductions: {},
    regimeChosen: "new" as const,
    now: NOW,
  };

  it("reports what is new since the last poll, and nothing on a first run", () => {
    const tx = [
      { amount: 5000, direction: "debit", merchant: "Swiggy", category: "Food", occurredAt: new Date(2026, 8, 16) },
      { amount: 90000, direction: "credit", merchant: "Client", category: "Fees", occurredAt: new Date(2026, 8, 16) },
    ];
    const first = monitorObservations({ ...base, transactions: tx, since: null });
    expect(first.some((o) => o.id === "mon.new")).toBe(false);

    const later = monitorObservations({ ...base, transactions: tx, since: new Date(2026, 8, 15) });
    const nu = later.find((o) => o.id === "mon.new");
    expect(nu?.title).toMatch(/2 new transactions/);
  });

  it("notices a payment far outside the usual size", () => {
    const tx = Array.from({ length: 12 }, (_, i) => ({
      amount: 1000, direction: "debit", merchant: "Shop", category: "Food",
      occurredAt: new Date(2026, 8, 10 + (i % 5)),
    }));
    tx.push({ amount: 90000, direction: "debit", merchant: "Apple", category: "Shopping", occurredAt: new Date(2026, 8, 16) });
    const o = monitorObservations({ ...base, transactions: tx });
    expect(o.find((x) => x.id === "mon.large")?.detail).toMatch(/Apple/);
  });

  it("stays quiet when nothing is unusual", () => {
    const tx = Array.from({ length: 12 }, () => ({
      amount: 1000, direction: "debit", merchant: "Shop", category: "Food", occurredAt: new Date(2026, 8, 15),
    }));
    expect(monitorObservations({ ...base, transactions: tx }).some((o) => o.id === "mon.large")).toBe(false);
  });

  it("warns as turnover nears the GST threshold, and escalates past it", () => {
    const t = RULES.gst.serviceRegistrationThreshold;
    const near = monitorObservations({ ...base, turnover: t - 100000 });
    expect(near.find((o) => o.id === "mon.gst.near")?.severity).toBe("attention");

    const over = monitorObservations({ ...base, turnover: t + 400000 });
    expect(over.find((o) => o.id === "mon.gst.over")?.severity).toBe("urgent");
  });

  it("says nothing about GST to a salaried user", () => {
    const o = monitorObservations({ ...base, occupation: "salaried", turnover: 99999999 });
    expect(o.some((x) => x.id.startsWith("mon.gst"))).toBe(false);
  });

  it("raises unused 80C headroom only under the old regime, near year end", () => {
    const feb = new Date(2027, 1, 10);
    const old = monitorObservations({ ...base, regimeChosen: "old", deductions: { "80C": 50000 }, now: feb });
    expect(old.find((o) => o.id === "mon.80c")?.detail).toMatch(/does not carry into next year/);

    const nu = monitorObservations({ ...base, regimeChosen: "new", deductions: { "80C": 50000 }, now: feb });
    expect(nu.some((o) => o.id === "mon.80c")).toBe(false);
  });

  it("notices spending running ahead of receipts", () => {
    const tx = [
      { amount: 200000, direction: "debit", merchant: "X", category: "Bills", occurredAt: NOW },
      { amount: 100000, direction: "credit", merchant: "Y", category: "Fees", occurredAt: NOW },
    ];
    expect(monitorObservations({ ...base, transactions: tx }).some((o) => o.id === "mon.outflow")).toBe(true);
  });
});

describe("the verifiable trace", () => {
  it("explains itself when nothing has been computed", () => {
    const o = traceObservations([], NOW);
    expect(o[0].detail).toMatch(/one entry per call/i);
  });

  it("counts calls and names the most used tools", () => {
    const rows = [
      { toolName: "compute_tax", createdAt: NOW, durationMs: 12 },
      { toolName: "compute_tax", createdAt: NOW, durationMs: 9 },
      { toolName: "compare_regimes", createdAt: NOW, durationMs: 40 },
    ];
    const o = traceObservations(rows, NOW);
    expect(o[0].title).toMatch(/3 calculations recorded/);
    expect(o[0].detail).toMatch(/compute_tax \(2\)/);
    expect(o.find((x) => x.id === "trace.slowest")?.detail).toMatch(/compare_regimes/);
  });
});

describe("the assembled report", () => {
  it("puts the pressing things first", () => {
    const r = buildReport([
      { id: "a", service: "trace", severity: "info", title: "", detail: "", order: 0 },
      { id: "b", service: "monitor", severity: "urgent", title: "", detail: "", order: 5 },
      { id: "c", service: "calendar", severity: "attention", title: "", detail: "", order: 1 },
    ], NOW);
    expect(r.observations.map((o) => o.id)).toEqual(["b", "c", "a"]);
    expect(r.counts).toEqual({ urgent: 1, attention: 1, info: 1 });
  });

  it("every observation that offers a question offers one a person would type", () => {
    const all = [
      ...complianceObservations({ occupation: "business", gstRegistered: true, now: NOW, horizonDays: 400 }),
      ...monitorObservations({
        occupation: "profession", transactions: [], turnover: 1900000,
        deductions: {}, regimeChosen: "old", now: NOW,
      }),
    ];
    for (const o of all) {
      if (!o.ask) continue;
      expect(o.ask.length).toBeGreaterThan(8);
      expect(/[_(){}]/.test(o.ask)).toBe(false);
    }
  });
});

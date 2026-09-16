"use client";
import type { ReactNode } from "react";

export function inr(n: number | string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const neg = v < 0;
  const s = Math.round(Math.abs(v)).toString();
  let out = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest.length) parts.unshift(rest);
    out = parts.join(",") + "," + last3;
  }
  return (neg ? "-" : "") + "\u20B9" + out;
}

export function pct(rate: number): string {
  const p = rate * 100;
  return (Math.abs(p % 1) < 0.01 ? p.toFixed(0) : p.toFixed(1)) + "%";
}

export function Card({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "win" | "warn" }) {
  const border = tone === "win" ? "border-moss" : tone === "warn" ? "border-amber" : "border-rule";
  const bg = tone === "win" ? "bg-moss/5" : tone === "warn" ? "bg-amber/5" : "bg-white";
  return <div className={`rounded border ${border} ${bg} p-3`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[9px] font-bold uppercase tracking-wider text-ink/45">{children}</div>;
}

export function Big({ children, tone }: { children: ReactNode; tone?: "win" }) {
  return <div className={`font-mono text-lg font-bold ${tone === "win" ? "text-moss" : "text-ink"}`}>{children}</div>;
}

export function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[3px] ${strong ? "font-bold" : ""}`}>
      <span className="text-[11px] text-ink/65">{k}</span>
      <span className="font-mono text-[11px] tabular-nums text-ink">{v}</span>
    </div>
  );
}

export function Bar({ share, tone = "indigo" }: { share: number; tone?: string }) {
  const colour = { indigo: "bg-indigo", moss: "bg-moss", amber: "bg-amber", teal: "bg-teal" }[tone] ?? "bg-indigo";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
      <div className={`h-full ${colour}`} style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
    </div>
  );
}

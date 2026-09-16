"use client";
import { Card, Label, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

/**
 * The generic renderer.
 *
 * Not every tool result deserves a bespoke component, and inventing one for
 * each would mean twenty half-designed cards rather than eight good ones.
 * This lays out the facts a tool produced, in the order it produced them,
 * with the trace attached. It is plain, and it is never wrong.
 */
const MONEY = /(tax|income|amount|saving|total|worth|gst|credit|payable|profit|receipts|turnover|deduction|exemption|liability|threshold|headroom|rent|tds|shortfall|deducted|spent|received|remaining|target|current)/i;

function humanise(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export default function FactCard({
  title, facts,
}: { title: string; facts: Record<string, number | string>; trace?: TraceNode | null }) {
  const entries = Object.entries(facts);
  if (entries.length === 0) return null;

  return (
    <Card>
      <Label>{title}</Label>
      <div className="mt-1.5">
        {entries.map(([k, v]) => (
          <Row
            key={k}
            k={humanise(k)}
            v={typeof v === "number" && MONEY.test(k) ? inr(v) : String(v)}
          />
        ))}
      </div>
    </Card>
  );
}

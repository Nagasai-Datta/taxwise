"use client";
import { Card, Label, Big, Bar, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

const TONES = ["indigo", "teal", "amber", "moss", "indigo", "teal"];

export default function SpendingBreakdown({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Spending</Label>
        <Big>{inr(data.totalSpent)}</Big>
      </div>
      <div className="mt-2 space-y-1.5">
        {data.categories.map((c: any, i: number) => (
          <div key={c.category}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-ink/75">{c.category}</span>
              <span className="font-mono text-[11px]">{inr(c.total)} <span className="text-ink/40">{pct(c.share)}</span></span>
            </div>
            <div className="mt-0.5"><Bar share={c.share} tone={TONES[i % TONES.length]} /></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

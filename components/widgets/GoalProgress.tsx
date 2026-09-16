"use client";
import { Card, Label, Bar, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function GoalProgress({ data }: { data: any; trace?: TraceNode | null }) {
  if (!data.goals?.length) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">No savings goals have been set yet.</p></Card>;
  }
  return (
    <Card>
      <Label>Goals</Label>
      <div className="mt-2 space-y-2.5">
        {data.goals.map((g: any) => (
          <div key={g.name}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-ink">{g.name}</span>
              <span className="font-mono text-[11px]">{inr(g.currentAmount)} <span className="text-ink/40">of {inr(g.targetAmount)}</span></span>
            </div>
            <div className="mt-1"><Bar share={g.progress} tone="moss" /></div>
            <div className="mt-0.5 text-[9.5px] text-ink/50">
              {pct(g.progress)} funded, {inr(g.remaining)} to go
              {g.monthsToTarget !== null ? `, about ${g.monthsToTarget} months at the current savings rate` : ""}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

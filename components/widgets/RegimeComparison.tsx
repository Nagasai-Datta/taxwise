"use client";
import { Card, Label, Big, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function RegimeComparison({ data }: { data: any; trace?: TraceNode | null }) {
  const win = data.recommended as "new" | "old";
  const side = (id: "new" | "old", r: any) => (
    <div className={`flex-1 rounded border p-2.5 ${win === id ? "border-moss bg-moss/5" : "border-rule bg-white"}`}>
      <div className="flex items-center justify-between">
        <Label>{r.regimeLabel}</Label>
        {win === id && <span className="rounded bg-moss px-1.5 py-px text-[8px] font-bold uppercase text-white">cheaper</span>}
      </div>
      <Big tone={win === id ? "win" : undefined}>{inr(r.totalTax)}</Big>
      <div className="mt-0.5 text-[10px] text-ink/50">taxable {inr(r.taxableIncome)}</div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">{side("new", data.newRegime)}{side("old", data.oldRegime)}</div>
      <Card>
        <div className="text-[11px] leading-snug text-ink/80">
          <span className="font-bold">Difference {inr(data.saving)}.</span> {data.rationale}
        </div>
      </Card>
    </div>
  );
}

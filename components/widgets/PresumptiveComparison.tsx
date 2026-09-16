"use client";
import { Card, Label, Big, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function PresumptiveComparison({ data }: { data: any; trace?: TraceNode | null }) {
  if (data.applicable === false) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">{data.reason}</p></Card>;
  }
  const win = data.recommended;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {data.options.map((o: any) => {
          const isWin = o.method === win;
          return (
            <div key={o.method} className={`flex-1 rounded border p-2.5 ${isWin ? "border-moss bg-moss/5" : "border-rule bg-white"}`}>
              <div className="flex items-center justify-between">
                <Label>{o.method === "presumptive" ? `Section ${o.scheme}` : "Regular books"}</Label>
                {isWin && <span className="rounded bg-moss px-1.5 py-px text-[8px] font-bold uppercase text-white">lower</span>}
              </div>
              <Big tone={isWin ? "win" : undefined}>{inr(o.declaredProfit)}</Big>
              <div className="mt-0.5 text-[9.5px] leading-tight text-ink/50">{o.basis}</div>
              {!o.eligible && <div className="mt-1 text-[9.5px] text-amber">{o.reason}</div>}
            </div>
          );
        })}
      </div>
      {data.caveats?.length > 0 && (
        <Card tone="warn">
          <Label>Conditions attached</Label>
          <ul className="mt-1 space-y-0.5">
            {data.caveats.map((c: string, i: number) => (
              <li key={i} className="text-[10.5px] leading-snug text-ink/75">{c}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

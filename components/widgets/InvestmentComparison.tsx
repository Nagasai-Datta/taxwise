"use client";
import { Card, Label, inr } from "./ui";

/**
 * Where a deduction could go.
 *
 * Two columns carry facts of different kinds and are kept visibly apart. What
 * the law fixes is knowable: the section, the lock-in, the treatment on exit.
 * What it saves is computable, by re-running the tax engine.
 *
 * There is no return column, and that absence is the point. A table that
 * ranked these by an assumed return would be the most confident and least
 * defensible thing in this project.
 */
export default function InvestmentComparison({ data }: { data: any }) {
  const options = (data?.options ?? []) as any[];
  const ranked = [...options].sort((a, b) =>
    (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0) || b.taxSavedIfFilled - a.taxSavedIfFilled);

  return (
    <div className="space-y-2">
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Where a deduction could go</Label>
          <span className="text-[9.5px] text-ink/45">tax now {inr(data?.baselineTax ?? 0)}</span>
        </div>

        <div className="mt-2 space-y-1.5">
          {ranked.map((o) => (
            <div key={o.id} className={"rounded border p-2 " + (o.eligible ? "border-rule bg-white" : "border-rule bg-panel/40")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] font-semibold text-ink">{o.name}</span>
                <span className="shrink-0 text-right">
                  {o.eligible ? (
                    <>
                      <span className="font-mono text-[11.5px] font-bold text-moss">{inr(o.taxSavedIfFilled)}</span>
                      <span className="block text-[8.5px] text-ink/40">if you fill {inr(o.headroom)}</span>
                    </>
                  ) : (
                    <span className="text-[9.5px] text-ink/40">ceiling full</span>
                  )}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-ink/55">
                <span className="font-mono text-ink/45">{o.section}</span>
                <span>{o.lockInNote}</span>
                <span>{o.character}</span>
                <span>risk: {o.risk}</span>
              </div>
              <p className="mt-0.5 text-[9.5px] text-ink/50">on exit: {o.taxOnMaturity}</p>
              <p className="mt-1 text-[10px] leading-snug text-ink/70">{o.suits}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card tone="warn">
        <Label>Read this before choosing</Label>
        <p className="mt-1 text-[10.5px] leading-snug text-ink/75">{data?.sharedCeilingNote}</p>
        <p className="mt-1.5 text-[10.5px] leading-snug text-ink/75">{data?.caveat}</p>
      </Card>
    </div>
  );
}

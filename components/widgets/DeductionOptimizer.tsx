"use client";
import { Card, Label, inr } from "./ui";

export default function DeductionOptimizer({ data }: { data: any }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Unused deductions</Label>
        <span className="text-[10px] text-ink/55">
          total available <span className="font-mono font-bold text-moss">{inr(data.totalPotentialSaving)}</span>
        </span>
      </div>
      <table className="mt-2 w-full text-[10.5px]">
        <thead>
          <tr className="text-left text-ink/45">
            <th className="py-1 font-medium">Section</th>
            <th className="py-1 text-right font-medium">Used</th>
            <th className="py-1 text-right font-medium">Headroom</th>
            <th className="py-1 text-right font-medium">Tax saved</th>
          </tr>
        </thead>
        <tbody>
          {data.opportunities.map((o: any) => (
            <tr key={o.section} className="border-t border-rule align-top">
              <td className="py-1.5">
                <div className="font-mono font-semibold">{o.section}</div>
                <div className="text-[9px] leading-tight text-ink/45">{o.label}</div>
              </td>
              <td className="py-1.5 text-right font-mono">{inr(o.currentAmount)}</td>
              <td className="py-1.5 text-right font-mono">{inr(o.headroom)}</td>
              <td className="py-1.5 text-right font-mono font-bold text-moss">
                {o.taxSavedIfFilled > 0 ? inr(o.taxSavedIfFilled) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[9.5px] leading-snug text-ink/45">
        Each saving is measured by re-running the whole tax engine with that section filled to its
        ceiling, not by applying an assumed marginal rate. That is why the figures respect slab
        boundaries and the section 87A cliff.
      </p>
    </Card>
  );
}

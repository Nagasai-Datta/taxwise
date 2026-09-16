"use client";
import { Card, Label, Big, Row, inr, pct } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function TaxBreakdown({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>{data.regimeLabel}</Label>
        <Big>{inr(data.totalTax)}</Big>
      </div>

      <table className="mt-2 w-full text-[10.5px]">
        <thead>
          <tr className="text-left text-ink/45">
            <th className="py-1 font-medium">Band</th>
            <th className="py-1 text-right font-medium">Rate</th>
            <th className="py-1 text-right font-medium">Taxed here</th>
            <th className="py-1 text-right font-medium">Tax</th>
          </tr>
        </thead>
        <tbody>
          {data.bands.map((b: any, i: number) => (
            <tr key={i} className={`border-t border-rule ${b.amountInBand > 0 ? "" : "text-ink/30"}`}>
              <td className="py-1 font-mono">{b.to === null ? "above " + inr(b.from) : inr(b.from) + " to " + inr(b.to)}</td>
              <td className="py-1 text-right font-mono">{pct(b.rate)}</td>
              <td className="py-1 text-right font-mono">{inr(b.amountInBand)}</td>
              <td className="py-1 text-right font-mono">{inr(b.taxInBand)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 border-t border-rule pt-1.5">
        <Row k="Taxable income" v={inr(data.taxableIncome)} />
        <Row k="Tax before rebate" v={inr(data.taxBeforeRebate)} />
        {data.rebate87A > 0 && <Row k="Section 87A rebate" v={"-" + inr(data.rebate87A)} />}
        <Row k="Cess at 4%" v={inr(data.cess)} />
        <Row k="Total tax" v={inr(data.totalTax)} strong />
      </div>
    </Card>
  );
}

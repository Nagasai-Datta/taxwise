"use client";
import { Card, Label, Big, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function GstSummary({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Net GST payable</Label>
        <Big>{inr(data.netGSTPayable)}</Big>
      </div>
      <div className="mt-2 border-t border-rule pt-1.5">
        <Row k="GST charged to customers" v={inr(data.outputGST)} />
        <Row k="Credit for GST paid on expenses" v={"-" + inr(data.inputTaxCredit)} />
        <Row k="Exports (zero-rated)" v={inr(data.exportTurnover)} />
      </div>
      <div className={`mt-2 rounded p-2 text-[10.5px] leading-snug ${data.registrationRequired ? "bg-amber/10 text-amber" : "bg-moss/10 text-moss"}`}>
        {data.registrationRequired
          ? `Turnover is above the ${inr(data.registrationThreshold)} threshold, so registration is required.`
          : `You have ${inr(data.headroomToThreshold)} of turnover left before registration becomes compulsory.`}
      </div>
    </Card>
  );
}

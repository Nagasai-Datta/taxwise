"use client";
import { Card, Label, Big, Row, inr } from "./ui";
import type { TraceNode } from "./TraceTree";

export default function NetWorth({ data }: { data: any; trace?: TraceNode | null }) {
  return (
    <Card>
      <Label>Net worth</Label>
      <Big>{inr(data.total)}</Big>
      <div className="mt-2 border-t border-rule pt-1.5">
        {data.byAccount.map((a: any, i: number) => (
          <Row key={i} k={`${a.bankName} ${a.maskedNumber} (${a.accountType})`} v={inr(a.balance)} />
        ))}
      </div>
    </Card>
  );
}

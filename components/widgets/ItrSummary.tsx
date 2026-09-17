"use client";
import { Card, Label, Row, inr } from "./ui";

/**
 * A prepared return.
 *
 * Eight steps, every one of them ordinary code with no model involved, which
 * matters most here because this is the one output someone might act on.
 *
 * Nothing is submitted anywhere. The download is a JSON document shaped like
 * an ITR-1, for checking against the government portal rather than replacing
 * it.
 */
export default function ItrSummary({ data }: { data: any }) {
  if (data?.applicable === false) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">{data.reason}</p></Card>;
  }
  if (!data?.steps) return null;

  const refund = data.refundDue as number;

  function download() {
    const blob = new Blob([JSON.stringify(data.itr, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ITR-1-${data.itr?.assessmentYear ?? "draft"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-2">
      <Card tone={refund >= 0 ? "win" : "warn"}>
        <div className="flex items-baseline justify-between">
          <Label>{refund >= 0 ? "Refund due to you" : "Still payable"}</Label>
          <span className={"font-mono text-lg font-bold " + (refund >= 0 ? "text-moss" : "text-amber")}>
            {inr(Math.abs(refund))}
          </span>
        </div>
        <div className="mt-2 border-t border-rule pt-1.5">
          <Row k="Gross salary" v={inr(data.grossSalary)} />
          {data.exemptAllowances > 0 && <Row k="Exempt under section 10" v={"-" + inr(data.exemptAllowances)} />}
          <Row k="Standard deduction" v={"-" + inr(data.standardDeduction)} />
          {data.professionalTax > 0 && <Row k="Professional tax" v={"-" + inr(data.professionalTax)} />}
          {data.chapterVIA > 0 && <Row k="Chapter VI-A deductions" v={"-" + inr(data.chapterVIA)} />}
          <Row k="Total income" v={inr(data.totalIncome)} strong />
          <Row k={`Tax under the ${data.regimeChosen === "new" ? "New Regime" : "Old Regime"}`} v={inr(data.taxPayable)} />
          <Row k="Tax already deducted" v={"-" + inr(data.tdsDeducted)} />
        </div>
      </Card>

      <Card>
        <Label>How it was prepared</Label>
        <div className="mt-1.5 space-y-1.5">
          {data.steps.map((s: any) => (
            <div key={s.n} className="flex gap-2">
              <span className={"mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold " +
                (s.ok ? "bg-moss/15 text-moss" : "bg-amber/20 text-amber")}>
                {s.ok ? "\u2713" : "!"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[10.5px] font-semibold text-ink">{s.title}</span>
                <span className="block text-[10px] leading-snug text-ink/60">{s.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {data.warnings?.length > 0 && (
        <Card tone="warn">
          <Label>Worth checking</Label>
          <ul className="mt-1 space-y-0.5">
            {data.warnings.map((w: string, i: number) => (
              <li key={i} className="text-[10.5px] leading-snug text-ink/75">{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <button onClick={download} className="rounded bg-ink px-3 py-1.5 text-[11px] font-medium text-white hover:bg-ink/90">
          Download the return
        </button>
        <span className="text-[9.5px] leading-snug text-ink/45">
          A JSON file on your computer. Nothing has been submitted anywhere.
        </span>
      </div>
    </div>
  );
}

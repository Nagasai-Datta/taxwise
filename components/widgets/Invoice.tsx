"use client";
import { Card, Label, Row, inr } from "./ui";

/**
 * An invoice, with the two things people get wrong made explicit.
 *
 * GST sits on top of the fee and is passed to the government, so it is never
 * income. TDS is taken off by the client before paying, so it is not a cost:
 * it is tax already paid on your behalf. Which means the amount that arrives
 * is neither the fee nor the total, and the card says so plainly.
 */
export default function Invoice({ data }: { data: any }) {
  if (data?.applicable === false) {
    return <Card tone="warn"><p className="text-[11px] text-ink/80">{data.reason}</p></Card>;
  }
  if (!data?.header) return null;

  function download() {
    const blob = new Blob([JSON.stringify(data.document, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.header.number || "invoice"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-2">
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Invoice {data.header.number}</Label>
          <span className="text-[9.5px] text-ink/45">{data.header.date}</span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 border-b border-rule pb-2">
          <div>
            <p className="text-[8.5px] uppercase tracking-wide text-ink/40">From</p>
            <p className="text-[11px] text-ink">{data.header.from.name}</p>
            <p className="text-[9.5px] text-ink/50">{data.header.from.city}</p>
          </div>
          <div>
            <p className="text-[8.5px] uppercase tracking-wide text-ink/40">To</p>
            <p className="text-[11px] text-ink">{data.header.to.name}</p>
            {data.header.to.address && <p className="text-[9.5px] text-ink/50">{data.header.to.address}</p>}
            {data.header.to.gstin && <p className="font-mono text-[9px] text-ink/45">{data.header.to.gstin}</p>}
          </div>
        </div>

        <p className="mt-2 text-[10.5px] text-ink/70">{data.description}</p>

        <div className="mt-2 border-t border-rule pt-1.5">
          {data.lines.map((l: any, i: number) => (
            <div key={i} className="flex items-baseline justify-between py-[3px]">
              <span className="text-[11px] text-ink/70">
                {l.label}
                {l.note && <span className="ml-1.5 text-[9px] text-ink/40">{l.note}</span>}
              </span>
              <span className="font-mono text-[11px] tabular-nums">{inr(l.value)}</span>
            </div>
          ))}
          <Row k="Invoice total" v={inr(data.total)} strong />
          {data.tdsExpected > 0 && <Row k="Less TDS the client deducts" v={"-" + inr(data.tdsExpected)} />}
        </div>

        <div className="mt-2 rounded bg-moss/10 px-2 py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold text-moss">What should actually reach you</span>
            <span className="font-mono text-[13px] font-bold text-moss">{inr(data.expectedReceipt)}</span>
          </div>
        </div>
      </Card>

      {data.notes?.length > 0 && (
        <Card>
          <Label>Worth knowing</Label>
          <ul className="mt-1 space-y-1">
            {data.notes.map((n: string, i: number) => (
              <li key={i} className="text-[10.5px] leading-snug text-ink/70">{n}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <button onClick={download} className="rounded bg-ink px-3 py-1.5 text-[11px] font-medium text-white hover:bg-ink/90">
          Download the invoice
        </button>
        <span className="text-[9.5px] text-ink/45">A JSON file on your computer. Nothing has been sent.</span>
      </div>
    </div>
  );
}

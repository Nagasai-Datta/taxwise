"use client";
import { Card, Label } from "./ui";

/**
 * The Tutor's rendering.
 *
 * There is no trace and no figure here, and that is correct rather than
 * incomplete: this component displays prose retrieved from a corpus that
 * contains no amounts. Where a figure is needed, the card names the tool that
 * would supply it, which is the handoff to the Computation agent.
 */
export default function ConceptAnswer({ data }: { data: any }) {
  const results = data?.results ?? [];
  if (results.length === 0) {
    return (
      <Card tone="warn">
        <p className="text-[11px] text-ink/80">{data?.note ?? "Nothing matched that question."}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((r: any, i: number) => (
        <Card key={r.id} tone={i === 0 ? "plain" : "plain"}>
          <div className="flex items-baseline justify-between gap-2">
            <Label>{r.title}</Label>
            <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink/35">
              {r.category} &middot; {r.level}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/80">{r.body}</p>
          {r.relatedTools?.length > 0 && (
            <p className="mt-2 border-t border-rule pt-1.5 text-[9.5px] text-ink/45">
              For your own figures, the Computation agent can run:{" "}
              <span className="font-mono">{r.relatedTools.join(", ")}</span>
            </p>
          )}
        </Card>
      ))}
      <p className="text-[9px] text-ink/35">
        {data.method === "vector" ? "Retrieved by meaning from the embedded corpus." : data.note}
      </p>
    </div>
  );
}

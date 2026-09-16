"use client";
import { useState } from "react";
import TraceTree, { type TraceNode } from "./widgets/TraceTree";

export interface Step { stage: string; usedModel: boolean; detail: string; ms: number }
export interface Route { agent: string; usedModel: boolean; reason: string; ms: number }
export interface ResultPayload {
  tool: string; component: string;
  facts: Record<string, number | string>;
  data: unknown; trace: TraceNode | null; durationMs?: number;
}

/**
 * Everything about one answer, in one place.
 *
 * Two questions get answered here, and they are different questions. "How was
 * this answered" is about the machinery: which agent took it, what was called,
 * whether a model was involved at each step, and whether the guard accepted
 * the reply. "The working" is about the arithmetic: which rule produced which
 * figure.
 *
 * It sits under the message rather than inside a result component, so it is
 * available in text mode as well as interactive, and appears exactly once
 * however many tools ran.
 */
export default function AnswerDetail({
  route, steps, results, guard, provider, totalMs,
}: {
  route: Route | null;
  steps: Step[];
  results: ResultPayload[];
  guard: { ok: boolean; offending: string[] } | null;
  provider?: string;
  totalMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const traced = results.filter((r) => r.trace);
  if (!route && steps.length === 0 && traced.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo hover:underline"
      >
        <span>{open ? "\u25BE" : "\u25B8"}</span>
        <span>how this was answered</span>
        {guard && (
          <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
            (guard.ok ? "bg-moss/15 text-moss" : "bg-red-100 text-red-700")}>
            {guard.ok ? "verified" : "corrected"}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-2 rounded border border-rule bg-white p-2.5">
          {route && (
            <Section label="Routing">
              <Line k={route.agent + " agent"} v={`${route.ms}ms`} model={route.usedModel} />
              <p className="mt-0.5 text-[10px] leading-snug text-ink/55">{route.reason}</p>
            </Section>
          )}

          {steps.length > 0 && (
            <Section label="Steps">
              {steps.map((s, i) => (
                <div key={i} className="mb-1">
                  <Line k={s.stage} v={`${s.ms}ms`} model={s.usedModel} />
                  <p className="mt-0.5 text-[10px] leading-snug text-ink/55">{s.detail}</p>
                </div>
              ))}
            </Section>
          )}

          {results.length > 0 && (
            <Section label="Kernel calls">
              {results.map((r, i) => (
                <div key={i} className="flex items-baseline justify-between py-px">
                  <span className="font-mono text-[10px] text-ink/70">{r.tool}</span>
                  <span className="font-mono text-[9px] text-ink/40">
                    {Object.keys(r.facts).length} facts{r.durationMs != null ? ` \u00b7 ${r.durationMs}ms` : ""}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {guard && (
            <div className={"rounded px-2 py-1.5 text-[10px] leading-snug " +
              (guard.ok ? "bg-moss/10 text-moss" : "bg-red-50 text-red-700")}>
              {guard.ok
                ? "Every figure in this answer came from a kernel call. No number was produced by the language model."
                : `The model wrote ${guard.offending.join(", ")}, which no tool produced. That reply was discarded and this one was written from the figures instead.`}
            </div>
          )}

          {traced.length > 0 && (
            <Section label="The working">
              {traced.map((r, i) => <TraceTree key={i} trace={r.trace} />)}
            </Section>
          )}

          {(provider || totalMs != null) && (
            <p className="text-[9px] text-ink/35">
              {provider}{totalMs != null ? ` \u00b7 ${totalMs}ms end to end` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-ink/40">{label}</div>
      {children}
    </div>
  );
}

function Line({ k, v, model }: { k: string; v: string; model: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-ink/80">{k}</span>
      <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
        (model ? "bg-teal/15 text-teal" : "bg-ink/10 text-ink/50")}>
        {model ? "model" : "no model"}
      </span>
      <span className="font-mono text-[9px] text-ink/35">{v}</span>
    </div>
  );
}

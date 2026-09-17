"use client";
import { useMemo, useState } from "react";
import { propagateGraph, type GraphNode, type NodeId } from "@/lib/kernel/graph";
import { Card, Label, inr } from "./ui";

/**
 * The causal graph, with the sliders live.
 *
 * Dragging recomputes in the browser by calling `propagateGraph` directly. That
 * is the same pure function the Computation agent's tools call on the server,
 * reading the same rulebook, so a preview cannot disagree with a committed
 * answer. The kernel has no network and no model, which is what makes it
 * portable enough to run in either place.
 *
 * The figure the conversation recorded came from a logged tool call. What the
 * sliders show is exploration, and it is labelled as such.
 */

const ORDER: NodeId[] = [
  "grossSalary", "hraExemption", "standardDeduction", "chapterVIA",
  "taxableIncome", "taxBeforeRebate", "rebate87A", "cess", "totalTax",
  "netIncome", "annualSpending", "annualSaving", "savingsRate",
];

export default function CausalGraph({ data }: { data: any }) {
  const nodes: GraphNode[] = data?.nodes ?? [];
  const levers: NodeId[] = data?.levers ?? [];
  const regime = data?.regime ?? "old";

  const [inputs, setInputs] = useState<Record<string, number>>(data?.inputs ?? {});
  const [open, setOpen] = useState<NodeId | null>(null);

  const baseline = useMemo(
    () => propagateGraph(data?.inputs ?? {}, regime).values,
    [data?.inputs, regime]
  );
  const values = useMemo(() => propagateGraph(inputs, regime).values, [inputs, regime]);

  const touched = levers.some((l) => (inputs[l] ?? 0) !== (data?.inputs?.[l] ?? 0));
  const byId = (id: NodeId) => nodes.find((n) => n.id === id);

  const fmt = (id: NodeId, v: number) => (byId(id)?.isRate ? `${v}%` : inr(v));

  return (
    <div className="space-y-2">
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>What moves what</Label>
          <span className="text-[9.5px] text-ink/45">
            {regime === "new" ? "New Regime" : "Old Regime"}
            {touched && <span className="ml-1.5 rounded bg-amber/15 px-1.5 py-px font-bold uppercase text-amber">exploring</span>}
          </span>
        </div>

        <p className="mt-1 text-[10px] leading-snug text-ink/50">
          Drag a slider and every figure below it recomputes. Click any row to see what it is
          made from.
        </p>

        {/* the levers */}
        <div className="mt-2.5 space-y-2">
          {levers.map((id) => {
            const n = byId(id);
            if (!n) return null;
            const v = inputs[id] ?? 0;
            const changed = v !== (data?.inputs?.[id] ?? 0);
            return (
              <div key={id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-ink/75">{n.label}</span>
                  <span className={"font-mono text-[10.5px] " + (changed ? "font-bold text-amber" : "text-ink/60")}>
                    {inr(v)}
                    {changed && <span className="ml-1 text-[9px] text-ink/40">was {inr(data.inputs[id])}</span>}
                  </span>
                </div>
                <input
                  type="range"
                  min={n.min ?? 0} max={n.max ?? 1000000} step={n.step ?? 1000}
                  value={v}
                  onChange={(e) => setInputs((s) => ({ ...s, [id]: Number(e.target.value) }))}
                  className="mt-0.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-panel accent-ink"
                />
              </div>
            );
          })}
        </div>

        {touched && (
          <button
            onClick={() => setInputs(data?.inputs ?? {})}
            className="mt-2 text-[10px] text-indigo hover:underline"
          >
            Put everything back
          </button>
        )}
      </Card>

      {/* the chain */}
      <Card>
        <Label>The chain</Label>
        <div className="mt-1.5">
          {ORDER.map((id) => {
            const n = byId(id);
            if (!n) return null;
            const v = values[id] ?? 0;
            const b = baseline[id] ?? 0;
            const d = v - b;
            const isOpen = open === id;
            return (
              <div key={id} className="border-b border-rule last:border-0">
                <button
                  onClick={() => setOpen(isOpen ? null : id)}
                  className="flex w-full items-baseline justify-between py-1 text-left hover:bg-panel/40"
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className={"h-1.5 w-1.5 rounded-full " + (n.kind === "input" ? "bg-indigo" : "bg-ink/20")} />
                    <span className={"text-[11px] " + (id === "totalTax" ? "font-bold text-ink" : "text-ink/75")}>
                      {n.label}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {fmt(id, v)}
                    {Math.abs(d) > 0.009 && (
                      <span className={"ml-1.5 text-[9.5px] " + (d < 0 ? "text-moss" : "text-amber")}>
                        {d > 0 ? "+" : ""}{n.isRate ? `${Math.round(d * 100) / 100}%` : inr(d)}
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-1.5 pl-3">
                    <p className="text-[10px] leading-snug text-ink/60">{n.explain}</p>
                    {n.from.length > 0 && (
                      <p className="mt-0.5 text-[9.5px] text-ink/40">
                        computed from {n.from.map((f) => byId(f)?.label ?? f).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[9px] leading-snug text-ink/35">
          Recomputed in your browser by the same rule engine the server uses, reading the same
          rulebook. No language model is involved at any point.
        </p>
      </Card>
    </div>
  );
}

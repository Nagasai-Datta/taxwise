"use client";
import { useState } from "react";
import { inr } from "./ui";

export interface TraceNode {
  ruleId: string;
  label: string;
  inputs: Record<string, number | string>;
  output: number;
  children?: TraceNode[];
}

function Node({ node, depth }: { node: TraceNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const kids = node.children?.length ?? 0;

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 12 }}>
      <div className="flex items-start gap-1.5 border-l border-rule py-[2px] pl-2">
        {kids > 0 ? (
          <button
            onClick={() => setOpen(!open)}
            className="mt-[1px] h-3.5 w-3.5 shrink-0 rounded-sm border border-rule text-[9px] leading-[12px] text-ink/50 hover:bg-panel"
            aria-label={open ? "collapse" : "expand"}
          >{open ? "\u2212" : "+"}</button>
        ) : <span className="w-3.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <span className="text-[11px] leading-snug text-ink/85">{node.label}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums">
              {node.output < 0 ? "-" + inr(-node.output) : inr(node.output)}
            </span>
          </div>
          <div className="font-mono text-[9px] text-ink/35">{node.ruleId}</div>
        </div>
      </div>
      {open && kids > 0 && node.children!.map((c, i) => <Node key={c.ruleId + i} node={c} depth={depth + 1} />)}
    </div>
  );
}

export default function TraceTree({ trace }: { trace: TraceNode | null }) {
  const [show, setShow] = useState(false);
  if (!trace) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setShow(!show)}
        className="text-[10px] font-semibold text-indigo hover:underline"
      >
        {show ? "\u25BE hide the working" : "\u25B8 show the working"}
      </button>
      {show && (
        <div className="mt-1.5 rounded border border-rule bg-white p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-moss" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-moss">verifiable trace</span>
            <span className="text-[9px] text-ink/40">every figure links to the rule that produced it</span>
          </div>
          <Node node={trace} depth={0} />
        </div>
      )}
    </div>
  );
}

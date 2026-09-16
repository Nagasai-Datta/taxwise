"use client";
import { useState } from "react";

export interface Step { stage: string; usedModel: boolean; detail: string; ms: number }

export interface Task {
  id: string;
  title: string;
  agent: string;
  provider: string;
  status: "running" | "completed" | "failed";
  steps: Step[];
  route: { agent: string; usedModel: boolean; reason: string; ms: number } | null;
  guard: { ok: boolean; offending: string[] } | null;
  tools: { tool: string; durationMs: number }[];
}

const ICON: Record<string, string> = { running: "\u25CB", completed: "\u2713", failed: "\u2717" };
const COLOUR: Record<string, string> = { running: "text-amber", completed: "text-moss", failed: "text-red-700" };

export default function TaskRail({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-rule bg-white">
      <div className="border-b border-rule px-3 py-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-ink/70">Tasks</h2>
        <p className="text-[9.5px] text-ink/45">what the system did, and why</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tasks.length === 0 && (
          <p className="px-1 py-8 text-center text-[10.5px] leading-snug text-ink/40">
            Ask something. Every step the system takes is listed here and can be opened.
          </p>
        )}

        {tasks.map((t) => (
          <div key={t.id} className="mb-1.5 rounded border border-rule">
            <button
              onClick={() => setOpen(open === t.id ? null : t.id)}
              className="flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-panel/60"
            >
              <span className={`mt-px text-[11px] ${COLOUR[t.status]}`}>{ICON[t.status]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10.5px] font-medium text-ink">{t.title}</span>
                <span className="block text-[9px] text-ink/45">{t.agent} &middot; {t.provider}</span>
              </span>
            </button>

            {open === t.id && (
              <div className="border-t border-rule bg-panel/40 px-2 py-1.5">
                {t.route && (
                  <div className="mb-1.5 border-l-2 border-teal pl-2">
                    <div className="text-[9.5px] font-semibold text-ink/80">Routing</div>
                    <div className="text-[9.5px] leading-snug text-ink/60">{t.route.reason}</div>
                    <Badge model={t.route.usedModel} ms={t.route.ms} />
                  </div>
                )}

                {t.steps.map((s, i) => (
                  <div key={i} className="mb-1.5 border-l-2 border-rule pl-2">
                    <div className="text-[9.5px] font-semibold text-ink/80">{s.stage}</div>
                    <div className="text-[9.5px] leading-snug text-ink/60">{s.detail}</div>
                    <Badge model={s.usedModel} ms={s.ms} />
                  </div>
                ))}

                {t.tools.length > 0 && (
                  <div className="mt-2 border-t border-rule pt-1.5">
                    <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-ink/50">Kernel calls</div>
                    {t.tools.map((x, i) => (
                      <div key={i} className="flex justify-between py-px">
                        <span className="font-mono text-[9px] text-ink/65">{x.tool}</span>
                        <span className="font-mono text-[9px] text-ink/40">{x.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                )}

                {t.guard && (
                  <div className={`mt-2 rounded px-1.5 py-1 text-[9.5px] ${t.guard.ok ? "bg-moss/10 text-moss" : "bg-red-50 text-red-700"}`}>
                    {t.guard.ok
                      ? "Guard passed: every figure traces to a kernel call."
                      : `Guard rejected ${t.guard.offending.join(", ")}. Deterministic phrasing was used instead.`}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function Badge({ model, ms }: { model: boolean; ms: number }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span className={`rounded px-1 py-px text-[8px] font-bold uppercase ${model ? "bg-teal/15 text-teal" : "bg-ink/10 text-ink/55"}`}>
        {model ? "model" : "no model"}
      </span>
      <span className="font-mono text-[8.5px] text-ink/35">{ms}ms</span>
    </div>
  );
}

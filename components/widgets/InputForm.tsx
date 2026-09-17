"use client";
import { useState } from "react";
import type { InputField, InputRequest } from "@/lib/kernel/tools/types";

/**
 * A tool asking for what it needs.
 *
 * Rendered inside the conversation rather than on a separate page, so the
 * request stays part of the exchange: the assistant asked, you answer, it
 * continues. Values are submitted back to the same tool, which then runs
 * normally and is logged like any other call.
 */
export default function InputForm({
  data, onSubmit, busy,
}: {
  data: InputRequest;
  onSubmit?: (tool: string, values: Record<string, string | number>) => void;
  busy?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of data.fields) v[f.name] = String(f.defaultValue ?? "");
    return v;
  });
  const [submitted, setSubmitted] = useState(false);

  const groups: { label: string; fields: InputField[] }[] = [];
  for (const f of data.fields) {
    const label = f.group ?? "";
    const g = groups.find((x) => x.label === label);
    if (g) g.fields.push(f); else groups.push({ label, fields: [f] });
  }

  const missing = data.fields.filter((f) => f.required && !values[f.name]?.trim());

  function submit() {
    if (missing.length || busy || submitted) return;
    setSubmitted(true);
    const out: Record<string, string | number> = {};
    for (const f of data.fields) {
      const raw = values[f.name] ?? "";
      out[f.name] = f.type === "number"
        ? Number(raw.replace(/[,\s\u20B9]/g, "")) || 0
        : raw;
    }
    onSubmit?.(data.resumeTool, out);
  }

  return (
    <div className="rounded border border-indigo/40 bg-indigo/[0.03] p-3">
      <p className="text-[11.5px] font-bold text-ink">{data.title}</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-ink/60">{data.description}</p>

      <div className="mt-2.5 space-y-2.5">
        {groups.map((g) => (
          <div key={g.label}>
            {g.label && (
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-indigo">{g.label}</p>
            )}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="block text-[10px] font-medium text-ink/75">{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      value={values[f.name]}
                      disabled={submitted}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="mt-0.5 w-full rounded border border-rule bg-white px-2 py-1 text-[11px] disabled:opacity-60"
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={values[f.name]}
                      disabled={submitted}
                      inputMode={f.type === "number" ? "numeric" : "text"}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="mt-0.5 w-full rounded border border-rule bg-white px-2 py-1 font-mono text-[11px] disabled:opacity-60"
                    />
                  )}
                  {f.help && <span className="mt-0.5 block text-[9px] leading-snug text-ink/45">{f.help}</span>}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!!missing.length || busy || submitted}
        className="mt-3 rounded bg-ink px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
      >
        {submitted ? "Sent" : data.submitLabel}
      </button>
      {missing.length > 0 && (
        <span className="ml-2 text-[10px] text-amber">
          {missing.length} required field{missing.length > 1 ? "s" : ""} still empty
        </span>
      )}
    </div>
  );
}

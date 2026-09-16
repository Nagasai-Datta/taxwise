"use client";
import { useCallback, useEffect, useState } from "react";
import type { Dossier } from "@/lib/kernel/memory";

interface Summary {
  turns: number; conceptsLearned: number; corpusSize: number;
  toolsUsed: number; notes: number; firstSeen: string | null; lastSeen: string | null;
}

const KIND_LABEL: Record<string, string> = {
  preference: "Prefers", decision: "Decided", question: "Unsure about", fact: "Worth knowing",
};
const KIND_TONE: Record<string, string> = {
  preference: "text-indigo", decision: "text-moss", question: "text-amber", fact: "text-ink/60",
};

/**
 * What the system knows about this person, and how far through the material
 * they are. Everything here was either observed from what actually ran, or
 * offered by the model on a single strictly parsed line.
 */
export default function MemoryPanel({ profileId }: { profileId: string }) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?profileId=${encodeURIComponent(profileId)}`);
      const j = await res.json();
      setDossier(j.dossier ?? null);
      setSummary(j.summary ?? null);
    } catch { /* leave empty */ } finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  async function forget() {
    await fetch(`/api/memory?profileId=${encodeURIComponent(profileId)}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-[11px] text-ink/40">Reading memory...</p>;

  const empty = !summary || summary.turns === 0;
  const pct = summary && summary.corpusSize > 0
    ? Math.round((summary.conceptsLearned / summary.corpusSize) * 100) : 0;

  return (
    <div className="space-y-3">
      {empty ? (
        <div className="rounded border border-rule bg-white p-3">
          <p className="text-[11px] leading-snug text-ink/60">
            Nothing remembered yet. Ask a few questions in the chat and this fills in:
            what you prefer, what you have decided, and which concepts you have had explained.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Conversations" v={String(summary!.turns)} />
            <Stat label="Concepts learned" v={`${summary!.conceptsLearned} of ${summary!.corpusSize}`} />
            <Stat label="Tools used" v={String(summary!.toolsUsed)} />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink/45">Learning progress</span>
              <span className="font-mono text-[10px] text-ink/50">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
              <div className="h-full bg-moss" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {dossier!.notes.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">What it knows</div>
              <div className="space-y-1">
                {dossier!.notes.map((n, i) => (
                  <div key={i} className="rounded border border-rule bg-white px-2 py-1.5">
                    <span className={"text-[9px] font-bold uppercase " + (KIND_TONE[n.kind] ?? "text-ink/60")}>
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                    <p className="text-[11px] leading-snug text-ink/80">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dossier!.concepts.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">Concepts explained</div>
              <div className="flex flex-wrap gap-1">
                {dossier!.concepts.map((c) => (
                  <span key={c.id} className="rounded-full border border-moss/40 bg-moss/5 px-2 py-0.5 text-[9.5px] text-moss">
                    {c.title}{c.times > 1 ? ` \u00d7${c.times}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {dossier!.tools.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink/45">Calculations run</div>
              <div className="flex flex-wrap gap-1">
                {dossier!.tools.map((t) => (
                  <span key={t.tool} className="rounded-full border border-rule bg-white px-2 py-0.5 font-mono text-[9px] text-ink/65">
                    {t.tool}{t.times > 1 ? ` \u00d7${t.times}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={forget} className="text-[10px] text-ink/40 hover:text-red-600 hover:underline">
            Forget everything about this profile
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-rule bg-white p-2 text-center">
      <div className="text-[8.5px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className="font-mono text-[12px] font-bold text-ink">{v}</div>
    </div>
  );
}

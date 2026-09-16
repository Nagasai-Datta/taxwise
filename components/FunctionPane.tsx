"use client";
import { useCallback, useEffect, useState } from "react";

interface Item { id: string; title: string; blurb: string; ask: string; tool: string }
interface Group { group: string; label: string; items: Item[] }

const GROUP_TONE: Record<string, string> = {
  learn: "text-teal", tax: "text-indigo", business: "text-amber", money: "text-moss",
};

/**
 * What this user can do, as a pane rather than a menu.
 *
 * Nothing here computes. A card composes a question and sends it into the
 * chat, so the chat remains the only route into the kernel and every request
 * still passes through routing, the tool registry and the audit log.
 *
 * Cards are per occupation, so a salaried user is never shown GST. Cards
 * already used are ticked from memory, which makes the pane a map of where
 * someone has been rather than a list of features.
 */
export default function FunctionPane({
  profileId, onAsk, busy, refreshKey,
}: {
  profileId: string;
  onAsk: (q: string) => void;
  busy: boolean;
  refreshKey: number;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capabilities?profileId=${encodeURIComponent(profileId)}`);
      const j = await res.json();
      setGroups(j.groups ?? []);
      setUsed(j.used ?? {});
    } catch { setGroups([]); }
  }, [profileId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const done = groups.reduce((n, g) => n + g.items.filter((i) => used[i.tool]).length, 0);

  if (collapsed) {
    return (
      <aside className="flex w-9 shrink-0 flex-col items-center border-r border-rule bg-white py-2">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Show what you can do"
          className="rounded px-1 py-1 text-[11px] text-ink/40 hover:bg-panel hover:text-ink"
        >
          &raquo;
        </button>
        <span className="mt-2 font-mono text-[9px] text-ink/30" style={{ writingMode: "vertical-rl" }}>
          what you can do
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-rule bg-white">
      <div className="flex items-start justify-between border-b border-rule px-3 py-2">
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-ink/70">What you can do</h2>
          <p className="text-[9.5px] text-ink/45">{done} of {total} tried</p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Hide"
          className="rounded px-1 text-[11px] text-ink/30 hover:bg-panel hover:text-ink"
        >
          &laquo;
        </button>
      </div>

      {total > 0 && (
        <div className="px-3 pt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-moss" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 && (
          <p className="px-1 py-6 text-center text-[10px] text-ink/40">Loading...</p>
        )}

        {groups.map((g) => (
          <div key={g.group} className="mb-3">
            <p className={"mb-1 px-1 text-[9px] font-bold uppercase tracking-wider " + (GROUP_TONE[g.group] ?? "text-ink/45")}>
              {g.label}
            </p>

            {g.items.map((c) => {
              const isOpen = open === c.id;
              const times = used[c.tool] ?? 0;
              return (
                <div
                  key={c.id}
                  className={"mb-1 rounded border " + (isOpen ? "border-ink/30 bg-panel/40" : "border-rule bg-white")}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
                  >
                    <span className={"mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full " + (times ? "bg-moss" : "bg-ink/15")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10.5px] font-semibold leading-snug text-ink">{c.title}</span>
                      {times > 1 && <span className="text-[8.5px] text-ink/35">used {times} times</span>}
                    </span>
                    <span className="mt-[1px] shrink-0 text-[9px] text-ink/30">{isOpen ? "\u2212" : "+"}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-rule px-2 py-2">
                      <p className="text-[10px] leading-snug text-ink/65">{c.blurb}</p>
                      <p className="mt-1 font-mono text-[8.5px] text-ink/30">{c.tool}</p>
                      <button
                        onClick={() => { onAsk(c.ask); setOpen(null); }}
                        disabled={busy}
                        className="mt-1.5 w-full rounded bg-ink px-2 py-1 text-[10px] font-medium text-white hover:bg-ink/90 disabled:opacity-40"
                      >
                        Compute
                      </button>
                      <p className="mt-1 text-[8.5px] leading-snug text-ink/35">
                        Sends &ldquo;{c.ask}&rdquo; to the chat. If anything else is needed, it will ask.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

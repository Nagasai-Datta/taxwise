"use client";
import { Card } from "./ui";

interface Item { id: string; title: string; blurb: string; ask: string; tool: string }
interface Group { group: string; label: string; items: Item[] }

/**
 * What this person can ask for.
 *
 * Serves two situations from one component. Asked "what can I do", it shows
 * everything, grouped. Reached because someone said they were lost, it leads
 * with four openers and keeps the full list below, so the answer to "I don't
 * know where to start" is a start rather than a catalogue.
 *
 * Every card sends a question into the chat. Nothing here computes anything.
 */
export default function Capabilities({
  data, onAsk,
}: { data: any; onAsk?: (q: string) => void }) {
  const groups: Group[] = data?.groups ?? [];
  const openers: Item[] = data?.openers ?? [];
  const guided = data?.guided === true;

  return (
    <div className="space-y-3">
      {guided && openers.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber">
            A good place to start
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {openers.map((c) => (
              <button
                key={c.id}
                onClick={() => onAsk?.(c.ask)}
                className="rounded border border-amber/50 bg-amber/5 p-2.5 text-left hover:bg-amber/10"
              >
                <div className="text-[11.5px] font-bold text-ink">{c.title}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-ink/60">{c.blurb}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <Card key={g.group}>
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink/45">{g.label}</p>
          <div className="space-y-1">
            {g.items.map((c) => (
              <button
                key={c.id}
                onClick={() => onAsk?.(c.ask)}
                className="block w-full rounded border border-rule px-2 py-1.5 text-left hover:bg-panel/60"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink">{c.title}</span>
                  <span className="shrink-0 font-mono text-[8.5px] text-ink/30">{c.tool}</span>
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-ink/55">{c.blurb}</div>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

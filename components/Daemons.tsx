"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Observation, Severity } from "@/lib/kernel/daemons";

/**
 * The always-on services, polling.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  POLL INTERVAL                                                        │
 * │  Thirty minutes by default. Override it for a demonstration with      │
 * │  NEXT_PUBLIC_DAEMON_POLL_SECONDS in .env.local, or press Check now.   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Polling happens in the browser rather than on a server timer. A background
 * job that outlives a request would be the only part of this system that
 * cannot be reproduced by re-running a command, and none of these services
 * needs to act while nobody is looking: they report, they do not do anything.
 */
const DEFAULT_SECONDS = 30 * 60;

const TONE: Record<Severity, string> = {
  urgent: "border-l-red-500 bg-red-50/50",
  attention: "border-l-amber bg-amber/5",
  info: "border-l-rule bg-white",
};
const DOT: Record<Severity, string> = {
  urgent: "bg-red-500", attention: "bg-amber", info: "bg-ink/20",
};

interface Service { id: string; label: string; what: string }

export default function Daemons({
  profileId, onAsk,
}: { profileId: string; onAsk?: (q: string) => void }) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPoll = useRef<string | null>(null);

  const seconds = Number(process.env.NEXT_PUBLIC_DAEMON_POLL_SECONDS ?? DEFAULT_SECONDS);

  const poll = useCallback(async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ profileId });
      if (lastPoll.current) q.set("since", lastPoll.current);
      const res = await fetch(`/api/daemons?${q.toString()}`);
      const j = await res.json();
      setObservations(j.observations ?? []);
      setServices(j.services ?? []);
      setRanAt(j.ranAt ?? null);
      lastPoll.current = j.ranAt ?? new Date().toISOString();
    } catch { /* leave the last report up */ } finally { setBusy(false); }
  }, [profileId]);

  useEffect(() => {
    lastPoll.current = null;
    poll();
    const t = setInterval(poll, Math.max(5, seconds) * 1000);
    return () => clearInterval(t);
  }, [poll, seconds]);

  const grouped = services.map((s) => ({
    ...s, items: observations.filter((o) => o.service === s.id),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[9.5px] text-ink/45">
          {ranAt ? `checked ${new Date(ranAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "not yet run"}
          {" · every "}{seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds}s`}
        </span>
        <button
          onClick={poll}
          disabled={busy}
          className="text-[10px] text-indigo hover:underline disabled:opacity-40"
        >
          {busy ? "checking..." : "check now"}
        </button>
      </div>

      {grouped.map((s) => (
        <div key={s.id}>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink/55">{s.label}</span>
            <span className="flex items-center gap-1">
              <span className={"h-1.5 w-1.5 rounded-full " + (busy ? "animate-pulse bg-teal" : "bg-moss")} />
              <span className="text-[8.5px] text-ink/35">running</span>
            </span>
          </div>
          <p className="mb-1 text-[9.5px] leading-snug text-ink/45">{s.what}</p>

          {s.items.length === 0 ? (
            <p className="rounded border border-rule bg-white px-2 py-1.5 text-[10px] text-ink/40">
              Nothing to report.
            </p>
          ) : (
            <div className="space-y-1">
              {s.items.map((o) => (
                <div key={o.id} className={"rounded border border-l-2 border-rule px-2 py-1.5 " + TONE[o.severity]}>
                  <div className="flex items-baseline gap-1.5">
                    <span className={"mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full " + DOT[o.severity]} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10.5px] font-semibold text-ink">{o.title}</span>
                      <span className="block text-[10px] leading-snug text-ink/65">{o.detail}</span>
                      {o.ask && onAsk && (
                        <button
                          onClick={() => onAsk(o.ask!)}
                          className="mt-0.5 text-[9.5px] text-indigo hover:underline"
                        >
                          {o.ask}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import { LAYERS } from "@/lib/layers";
import { listProfiles, source } from "@/lib/db/repositories";
import { toTaxInput } from "@/lib/kernel/profiles";
import { compareRegimes } from "@/lib/kernel/regimes";
import { RULES } from "@/lib/kernel/rules";
import { inr } from "@/lib/kernel/money";
import { providerSummary } from "@/lib/agents/providers";
import { AGENT_REGISTRY, AGENT_IDS } from "@/lib/kernel/agents";
import { TOOL_NAMES } from "@/lib/kernel/tools/registry";

export const dynamic = "force-dynamic";

export default async function Status() {
  const verified = RULES._meta.verification.status === "VERIFIED";
  const src = await source();
  const prov = providerSummary();
  const rows = (await listProfiles()).map((p) => ({ p, c: compareRegimes(toTaxInput(p)) }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber">Phase 6 complete</p>
        <a href="/" className="text-[11px] text-indigo hover:underline">open the chat</a>
      </div>
      <h1 className="mt-1 text-xl font-bold">Shell, agents, kernel and data. All five layers now exist.</h1>
      <p className="mt-2 text-sm text-ink/60">
        FY {RULES._meta.financialYear} &middot; AY {RULES._meta.assessmentYear} &middot; {RULES._meta.governingAct}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill ok={src === "database"} on="reading from Supabase" off="reading from seed fixtures" />
        <Pill ok={!!prov.groq} on={"groq " + prov.groq} off="no Groq key" />
        <Pill ok={!!prov.gemini} on={"gemini " + prov.gemini} off="no Gemini key" />
        <Pill ok={verified} on="rulebook verified" off="rulebook not yet verified" />
      </div>

      <Section title="Agents and their permitted tools">
        {AGENT_IDS.map((id) => {
          const a = AGENT_REGISTRY[id];
          return (
            <div key={id} className="rounded border border-rule bg-white p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">{a.name}</span>
                <span className="text-[10px] text-ink/45">{a.provider} &middot; {a.tools.length} of {TOOL_NAMES.length} tools</span>
              </div>
              <p className="mt-1 text-[11px] text-ink/60">{a.handles}</p>
              <p className="mt-1 font-mono text-[9.5px] leading-snug text-ink/45">{a.tools.join("  ")}</p>
            </div>
          );
        })}
      </Section>

      <Section title="Every profile, computed live by the kernel">
        {rows.map(({ p, c }) => (
          <div key={p.id} className="rounded border border-rule bg-white p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">{p.name}</span>
              <span className="text-[10.5px] text-ink/50">{p.jobTitle} &middot; {p.city}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Cell label="New Regime" v={inr(c.newRegime.totalTax)} win={c.recommended === "new"} />
              <Cell label="Old Regime" v={inr(c.oldRegime.totalTax)} win={c.recommended === "old"} />
              <Cell label="Difference" v={inr(c.saving)} win={false} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Layers">
        {LAYERS.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded border border-rule bg-white px-3 py-2">
            <span className="w-24 text-sm font-bold">{l.name}</span>
            <span className="flex-1 text-[11px] text-ink/65">{l.owns}</span>
            <span className={"rounded px-2 py-0.5 text-[10px] font-bold " +
              (l.status === "built" ? "bg-moss/15 text-moss" : "bg-ink/8 text-ink/45")}>
              {l.status === "built" ? "built" : "phase " + l.phase}
            </span>
          </div>
        ))}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mt-8 text-[11px] font-bold uppercase tracking-widest text-ink/60">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </>
  );
}

function Pill({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span className={"rounded px-2 py-1 text-[11px] font-bold " + (ok ? "bg-moss/15 text-moss" : "bg-amber/15 text-amber")}>
      {ok ? on : off}
    </span>
  );
}

function Cell({ label, v, win }: { label: string; v: string; win: boolean }) {
  return (
    <div className={"rounded border p-2 " + (win ? "border-moss bg-moss/5" : "border-rule")}>
      <div className="text-[9px] uppercase text-ink/45">{label}</div>
      <div className="font-mono text-sm font-bold">{v}</div>
    </div>
  );
}

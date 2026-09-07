import { LAYERS } from "@/lib/layers";
import { allProfiles, toTaxInput } from "@/lib/kernel/profiles";
import { compareRegimes } from "@/lib/kernel/regimes";
import { RULES } from "@/lib/kernel/rules";
import { inr } from "@/lib/kernel/money";

export default function Page() {
  const verified = RULES._meta.verification.status === "VERIFIED";
  const rows = allProfiles().map((p) => ({ p, c: compareRegimes(toTaxInput(p)) }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber">Phase 1 complete</p>
      <h1 className="mt-1 text-xl font-bold">The kernel works. Nothing above it exists yet.</h1>
      <p className="mt-2 text-sm text-ink/60">
        FY {RULES._meta.financialYear} &middot; AY {RULES._meta.assessmentYear} &middot; {RULES._meta.governingAct}
      </p>

      {!verified && (
        <div className="mt-5 rounded border border-amber bg-amber/5 p-4">
          <p className="text-sm font-bold text-amber">The rulebook is not yet verified</p>
          <p className="mt-1 text-xs leading-snug text-ink/70">
            Every figure below is computed correctly from data/tax_rules.json, but nobody has
            checked that file against the official rate tables. Run <code>npm run checklist</code>,
            tick off each figure, then fill in _meta.verification.
          </p>
        </div>
      )}

      <h2 className="mt-8 text-[11px] font-bold uppercase tracking-widest text-ink/60">
        Every profile, computed live by the kernel
      </h2>
      <div className="mt-3 space-y-3">
        {rows.map(({ p, c }) => (
          <div key={p.id} className="rounded border border-rule bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">{p.name}</span>
              <span className="text-[11px] text-ink/50">{p.jobTitle} &middot; {p.city}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <Cell label="New Regime" v={inr(c.newRegime.totalTax)} win={c.recommended === "new"} />
              <Cell label="Old Regime" v={inr(c.oldRegime.totalTax)} win={c.recommended === "old"} />
              <Cell label="Difference" v={inr(c.saving)} win={false} />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink/55">{p.exercises}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-[11px] font-bold uppercase tracking-widest text-ink/60">Layers</h2>
      <div className="mt-3 space-y-1.5">
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
      </div>
    </main>
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

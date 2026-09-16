import { listProfiles, listAccounts, listGoals } from "@/lib/db/repositories";
import { toTaxInput } from "@/lib/kernel/profiles";
import { compareRegimes } from "@/lib/kernel/regimes";
import { getApplicableDeadlines } from "@/lib/kernel/business";
import { inr } from "@/lib/kernel/money";
import MemoryPanel from "@/components/MemoryPanel";
import ProfilePicker from "@/components/ProfilePicker";

export const dynamic = "force-dynamic";

/**
 * The profile page.
 *
 * What the system holds about one person: who they are, what they have, what
 * is due, and what it has remembered. The always-on services will be added
 * here in a later phase; the compliance calendar is the first of them and
 * already reads from the rulebook.
 */
export default async function ProfilePage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const profiles = await listProfiles();
  const p = profiles.find((x) => x.id === (id ?? profiles[0]?.id)) ?? profiles[0];

  const accounts = await listAccounts(p.id);
  const goals = await listGoals(p.id);
  const c = compareRegimes(toTaxInput(p));
  const deadlines = getApplicableDeadlines({
    occupation: p.occupation,
    gstRegistered: (p.income.turnoverAnnual ?? p.income.grossReceiptsAnnual ?? 0) > 2000000,
  });
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{p.name}</h1>
          <p className="text-[11.5px] text-ink/55">{p.jobTitle} &middot; {p.city} &middot; age {p.age}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProfilePicker profiles={profiles.map((x) => ({ id: x.id, name: x.name, jobTitle: x.jobTitle }))} current={p.id} />
          <a href="/" className="text-[11px] text-indigo hover:underline">back to chat</a>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Money">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Net worth" v={inr(netWorth)} />
              <Stat label="Gross income" v={inr(p.income.grossAnnual)} />
              <Stat label="Tax, recommended" v={inr(c[c.recommended === "new" ? "newRegime" : "oldRegime"].totalTax)} />
              <Stat label="Rent, annual" v={inr(p.rentMonthly * 12)} />
            </div>
          </Section>

          <Section title="Accounts">
            {accounts.length === 0 ? (
              <Empty>No accounts. Run <code>npm run db:seed</code>.</Empty>
            ) : accounts.map((a) => (
              <Row key={a.id} k={`${a.bankName} ${a.maskedNumber}`} sub={a.accountType} v={inr(a.balance)} />
            ))}
          </Section>

          <Section title="Goals">
            {goals.length === 0 ? <Empty>No goals set.</Empty> : goals.map((g) => {
              const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
              return (
                <div key={g.id} className="mb-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11.5px] font-semibold text-ink">{g.name}</span>
                    <span className="font-mono text-[11px]">{inr(g.currentAmount)} <span className="text-ink/40">of {inr(g.targetAmount)}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div className="h-full bg-moss" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title="Compliance calendar">
            {deadlines.map((d) => (
              <Row key={d.id} k={d.label} sub={`applies to ${(d.appliesTo as string[]).join(", ")}`} v={d.date} />
            ))}
          </Section>
        </div>

        <div>
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink/55">Memory</h2>
          <MemoryPanel profileId={p.id} />
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink/55">{title}</h2>
      <div className="rounded border border-rule bg-white p-3">{children}</div>
    </div>
  );
}
function Row({ k, sub, v }: { k: string; sub?: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule py-1.5 last:border-0">
      <span>
        <span className="text-[11.5px] text-ink">{k}</span>
        {sub && <span className="ml-2 text-[9.5px] text-ink/45">{sub}</span>}
      </span>
      <span className="font-mono text-[11.5px] text-ink">{v}</span>
    </div>
  );
}
function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-rule bg-white p-2">
      <div className="text-[8.5px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className="font-mono text-[13px] font-bold text-ink">{v}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-ink/45">{children}</p>;
}

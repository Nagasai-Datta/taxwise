"use client";
import { useCallback, useEffect, useState } from "react";
import type { AccountLike, PaymentProblem } from "@/lib/kernel/payments";

/**
 * The gateway screen.
 *
 * Deliberately unlike the rest of the product: its own vocabulary, its own
 * colours, one job. It is a separate application that happens to run on the
 * same command, and it writes to one table the main application reads.
 */

const QUICK = [500, 2000, 10000, 50000];

export default function Gateway() {
  const [accounts, setAccounts] = useState<AccountLike[]>([]);
  const [connected, setConnected] = useState(true);
  const [action, setAction] = useState<"add" | "transfer">("transfer");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState<PaymentProblem[]>([]);
  const [receipt, setReceipt] = useState<{ reference: string; summary: string; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway");
      const j = await res.json();
      setAccounts(j.accounts ?? []);
      setConnected(j.connected !== false);
      if (!from && j.accounts?.[0]) setFrom(j.accounts[0].id);
      if (!to && j.accounts?.[1]) setTo(j.accounts[1].id);
    } catch { setConnected(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const problemFor = (f: PaymentProblem["field"]) => problems.find((p) => p.field === f)?.message;
  const acc = (id: string) => accounts.find((a) => a.id === id);

  async function submit() {
    setBusy(true);
    setProblems([]);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, amount, toAccountId: to,
          fromAccountId: action === "transfer" ? from : undefined,
          note,
        }),
      });
      const j = await res.json();
      if (j.problems) { setProblems(j.problems); setConfirming(false); return; }
      if (j.error) { setProblems([{ field: "action", message: j.error }]); setConfirming(false); return; }
      setReceipt({ reference: j.reference, summary: j.summary, at: j.at });
      setAccounts(j.accounts ?? accounts);
      setAmount(""); setNote(""); setConfirming(false);
    } catch {
      setProblems([{ field: "action", message: "The gateway could not be reached." }]);
    } finally { setBusy(false); }
  }

  if (!connected) {
    return (
      <div className="rounded-lg border border-amber/40 bg-amber/5 p-4">
        <p className="text-[12px] font-semibold text-ink">No accounts are connected.</p>
        <p className="mt-1 text-[11px] leading-snug text-ink/60">
          The gateway records payments against the accounts in the database. Run
          <code className="mx-1">npm run db:seed</code> and reload.
        </p>
      </div>
    );
  }

  if (receipt) {
    return (
      <div className="rounded-lg border border-moss/40 bg-moss/5 p-5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-moss text-[18px] text-white">&#10003;</div>
        <p className="mt-2.5 text-[13px] font-semibold text-ink">Payment recorded</p>
        <p className="mt-1 text-[12px] text-ink/70">{receipt.summary}</p>
        <p className="mt-2 font-mono text-[10px] text-ink/40">{receipt.reference}</p>
        <p className="text-[10px] text-ink/40">
          {new Date(receipt.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <p className="mx-auto mt-3 max-w-xs text-[10px] leading-snug text-ink/50">
          TaxWise will see this the next time its monitor polls. Open the profile page there and
          press <span className="font-medium">check now</span>.
        </p>
        <button
          onClick={() => setReceipt(null)}
          className="mt-3 rounded bg-ink px-4 py-1.5 text-[11.5px] font-medium text-white"
        >
          Make another payment
        </button>
      </div>
    );
  }

  const fromAcc = acc(from);
  const toAcc = acc(to);

  return (
    <div className="space-y-3">
      {/* what to do */}
      <div className="inline-flex overflow-hidden rounded-lg border border-rule">
        {(["transfer", "add"] as const).map((a) => (
          <button
            key={a}
            onClick={() => { setAction(a); setProblems([]); }}
            className={"px-3.5 py-1.5 text-[11.5px] font-medium " +
              (action === a ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-panel")}
          >
            {a === "transfer" ? "Send money" : "Add funds"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-rule bg-white p-4">
        {/* amount */}
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Amount</span>
          <div className="mt-1 flex items-baseline gap-1.5 border-b border-rule pb-1">
            <span className="text-[20px] text-ink/35">&#8377;</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="0"
              inputMode="numeric"
              className="w-full bg-transparent font-mono text-[22px] outline-none placeholder:text-ink/20"
            />
          </div>
        </label>
        <div className="mt-1.5 flex gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              className="rounded-full border border-rule px-2 py-0.5 text-[10px] text-ink/60 hover:bg-panel"
            >
              &#8377;{q.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        {problemFor("amount") && <p className="mt-1 text-[10.5px] text-red-600">{problemFor("amount")}</p>}

        {/* accounts */}
        <div className="mt-3 space-y-2">
          {action === "transfer" && (
            <Picker
              label="From" value={from} onChange={setFrom} accounts={accounts}
              problem={problemFor("from")} showBalance
            />
          )}
          <Picker
            label={action === "transfer" ? "To" : "Add to"} value={to} onChange={setTo}
            accounts={accounts} problem={problemFor("to")} showBalance
          />
        </div>

        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Note, optional</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={action === "transfer" ? "Rent, dinner, invoice 12" : "Salary, savings"}
            className="mt-1 w-full rounded border border-rule px-2 py-1.5 text-[11.5px] outline-none focus:border-ink"
          />
        </label>

        {problemFor("action") && <p className="mt-2 text-[10.5px] text-red-600">{problemFor("action")}</p>}

        {!confirming ? (
          <button
            onClick={() => { setProblems([]); setConfirming(true); }}
            disabled={busy || !amount}
            className="mt-3 w-full rounded bg-ink py-2 text-[12px] font-medium text-white disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <div className="mt-3 rounded border border-ink/25 bg-panel/50 p-2.5">
            <p className="text-[11.5px] text-ink">
              {action === "transfer"
                ? <>Send <b>&#8377;{Number(amount.replace(/,/g, "")).toLocaleString("en-IN")}</b> from {fromAcc?.ownerName} to {toAcc?.ownerName}?</>
                : <>Add <b>&#8377;{Number(amount.replace(/,/g, "")).toLocaleString("en-IN")}</b> to {toAcc?.ownerName}&apos;s {toAcc?.bankName}?</>}
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={submit} disabled={busy}
                className="flex-1 rounded bg-ink py-1.5 text-[11.5px] font-medium text-white disabled:opacity-40">
                {busy ? "Recording..." : "Confirm"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy}
                className="rounded border border-rule px-3 py-1.5 text-[11.5px] text-ink/60">
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* balances */}
      <div className="rounded-lg border border-rule bg-white p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Accounts</p>
        <div className="mt-1.5 space-y-1">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-baseline justify-between border-b border-rule py-1 last:border-0">
              <span>
                <span className="text-[11.5px] text-ink">{a.ownerName}</span>
                <span className="ml-1.5 text-[10px] text-ink/45">{a.bankName} {a.maskedNumber}</span>
                <span className="ml-1.5 rounded bg-panel px-1 text-[9px] text-ink/50">{a.accountType}</span>
              </span>
              <span className="font-mono text-[11.5px] tabular-nums">&#8377;{a.balance.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Picker({
  label, value, onChange, accounts, problem, showBalance,
}: {
  label: string; value: string; onChange: (v: string) => void;
  accounts: AccountLike[]; problem?: string; showBalance?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-rule bg-white px-2 py-1.5 text-[11.5px] outline-none focus:border-ink"
      >
        <option value="">Choose an account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.ownerName} · {a.bankName} {a.maskedNumber} ({a.accountType})
            {showBalance ? ` · \u20B9${a.balance.toLocaleString("en-IN")}` : ""}
          </option>
        ))}
      </select>
      {problem && <p className="mt-1 text-[10.5px] text-red-600">{problem}</p>}
    </label>
  );
}

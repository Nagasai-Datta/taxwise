import Gateway from "@/components/Gateway";

export const dynamic = "force-dynamic";

/**
 * A separate application, on the same command.
 *
 * It shares a database table with TaxWise and nothing else: no agents, no
 * kernel, no rulebook. It writes; TaxWise reads. That is the same shape as
 * India's Account Aggregator framework, where an application may see a bank
 * without touching it, and it is what makes the proactive monitor
 * demonstrable rather than merely described.
 */
export default function GatewayPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold tracking-tight text-ink">PayLite</span>
          <a href="/" className="text-[10.5px] text-ink/40 hover:text-ink hover:underline">back to TaxWise</a>
        </div>
        <p className="mt-0.5 text-[10.5px] text-ink/50">
          A standalone payments app. Simulated money, real flow.
        </p>
      </header>

      <Gateway />

      <p className="mt-5 text-center text-[9.5px] leading-snug text-ink/35">
        PayLite writes a transaction row. TaxWise only reads that table, and will
        notice the next time its monitor polls.
      </p>
    </main>
  );
}

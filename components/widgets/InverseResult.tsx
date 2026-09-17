"use client";
import { Card, Label, Row, inr } from "./ui";

/**
 * Working backwards.
 *
 * The question nothing else answers: not "what happens if I invest more", but
 * "how much must I invest for my tax to be this". Solved by bisection rather
 * than algebra, because the section 87A rebate is a cliff and an algebraic
 * inverse steps straight over it.
 *
 * When a target cannot be reached, that is said plainly rather than a nearest
 * value being presented as though it were the answer.
 */
export default function InverseResult({ data }: { data: any }) {
  if (!data) return null;
  const ok = data.achievable === true;
  const rate = data.target === "savingsRate";
  const fmt = (n: number) => (rate ? `${Math.round(n * 100) / 100}%` : inr(n));

  return (
    <Card tone={ok ? "win" : "warn"}>
      <div className="flex items-baseline justify-between">
        <Label>{ok ? "To get there" : "Not reachable that way"}</Label>
        <span className="text-[9.5px] text-ink/45">solved in {data.iterations} steps</span>
      </div>

      {ok && (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold text-moss">{inr(data.requiredLever)}</span>
          <span className="text-[10.5px] text-ink/60">of {data.leverLabel}</span>
        </div>
      )}

      <p className="mt-1.5 text-[11px] leading-snug text-ink/80">{data.explanation}</p>

      <div className="mt-2 border-t border-rule pt-1.5">
        <Row k={`${data.leverLabel} now`} v={inr(data.currentLever)} />
        {ok && <Row k={`${data.leverLabel} needed`} v={inr(data.requiredLever)} strong />}
        <Row k={`${data.targetLabel} now`} v={fmt(data.currentValue)} />
        <Row k={`${data.targetLabel} wanted`} v={fmt(data.targetValue)} />
        {ok && <Row k={`${data.targetLabel} reached`} v={fmt(data.achievedValue)} />}
      </div>

      {data.atCeiling && ok && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber">
          That is at the limit the rules allow, so there is no further room in this direction.
        </p>
      )}
    </Card>
  );
}

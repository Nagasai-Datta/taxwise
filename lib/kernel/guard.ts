/**
 * The last line of defence.
 *
 * Objective 3 says the model never produces a figure. The tool registry makes
 * that structurally true for anything the kernel computes, but a model can
 * still write a number into its own prose, either by inventing one or by doing
 * arithmetic on figures it was legitimately given.
 *
 * This scans a reply for rupee amounts and rejects any that did not come from
 * a tool result. It is the difference between telling a model not to invent
 * figures and catching it when it does.
 */

/**
 * Scale words a model reaches for instead of writing the figure out.
 * Indian and Western units both appear, sometimes in the same reply.
 */
const SCALES: [RegExp, number][] = [
  [/crores?/i, 10000000],
  [/lakhs?|lacs?/i, 100000],
  [/millions?/i, 1000000],
  [/billions?/i, 1000000000],
  [/thousands?/i, 1000],
  [/\bk\b/i, 1000],
];

export interface GuardResult {
  ok: boolean;
  offending: string[];
  allowed: string[];
}

/** Pull every number out of a string, normalising Indian grouping and rupee signs. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(?:\u20B9|Rs\.?|INR)?\s?(\d[\d,]*(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Numbers we do not police. Small integers appear constantly in ordinary
 * prose ("the least of three amounts", "four percent", "section 80C") and
 * flagging them would make the guard useless through noise.
 */
function isExempt(n: number, allowed: Set<number>): boolean {
  if (allowed.has(n)) return true;
  if (Number.isInteger(n) && n >= 0 && n <= 100) return true;   // percentages, counts, small ordinals
  if ([80, 80.5, 24, 194, 44].includes(n)) return true;          // section numbers
  return false;
}

/**
 * Resolve scaled expressions before extracting bare numbers.
 *
 * "9 million" must be judged as 9000000, not as 9. Without this the small
 * number exemption, which exists so that "the least of three amounts" does
 * not trip the guard, would wave through any invented figure a model chose
 * to express in millions or lakh.
 */
function resolveScales(text: string): { text: string; resolved: number[] } {
  const resolved: number[] = [];
  const out = text.replace(
    /(\d+(?:\.\d+)?)\s*(crores?|lakhs?|lacs?|millions?|billions?|thousands?|k)\b/gi,
    (whole, num: string, unit: string) => {
      const mult = SCALES.find(([re]) => re.test(unit))?.[1];
      if (!mult) return whole;
      const v = Math.round(Number(num) * mult);
      resolved.push(v);
      return " ";   // remove it so the bare number is not counted twice
    }
  );
  return { text: out, resolved };
}

export function checkReply(text: string, facts: Record<string, number | string>[]): GuardResult {
  const allowed = new Set<number>();
  for (const f of facts) {
    for (const v of Object.values(f)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        allowed.add(v);
        allowed.add(Math.abs(v));
        allowed.add(Math.round(v));
      }
    }
  }

  const { text: stripped, resolved } = resolveScales(text);

  const offending = [
    // Scaled expressions are judged at full value, with no small number
    // exemption: nobody writes "4 million" to mean the cess percentage.
    ...resolved.filter((n) => !allowed.has(n)),
    ...extractNumbers(stripped).filter((n) => !isExempt(n, allowed)),
  ].map((n) => n.toLocaleString("en-IN"));

  return {
    ok: offending.length === 0,
    offending: [...new Set(offending)],
    allowed: [...allowed].map((n) => n.toLocaleString("en-IN")),
  };
}

/**
 * Rewrite the figures in a reply using Indian digit grouping.
 *
 * A model will happily write 2,400,000 where an Indian reader expects
 * 24,00,000. Instructing it not to is unreliable, so this does not ask. The
 * guard has already established that every figure came from a tool result,
 * which means we know the exact values and can substitute the correctly
 * formatted form for whatever the model wrote.
 *
 * Deterministic, so the displayed number cannot drift from the computed one.
 */
export function inrGroup(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  let out = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest.length) parts.unshift(rest);
    out = parts.join(",") + "," + last3;
  }
  return (neg ? "-" : "") + out;
}

export function normaliseNumbers(text: string, facts: Record<string, number | string>[]): string {
  const values = new Set<number>();
  for (const f of facts) {
    for (const v of Object.values(f)) {
      if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 1000) values.add(Math.round(v));
    }
  }
  if (values.size === 0) return text;

  let out = text;

  /**
   * Pass one: scaled expressions.
   *
   * A model will write "a turnover of 2.4 million" rather than 24,00,000, and
   * the guard then rejects 2.4 as a figure no tool produced. It is not wrong,
   * it has rescaled. So the scaled phrase is resolved to its underlying value
   * and, if that value is one a tool actually returned, replaced with the
   * exact figure. If it resolves to something no tool produced, it is left
   * alone and the guard rejects it, which is the correct outcome.
   */
  const scaled = /(\d+(?:\.\d+)?)\s*(crores?|lakhs?|lacs?|millions?|billions?|thousands?|k)\b/gi;
  out = out.replace(scaled, (whole, num: string, unit: string) => {
    const mult = SCALES.find(([re]) => re.test(unit))?.[1];
    if (!mult) return whole;
    const resolved = Math.round(Number(num) * mult);
    return values.has(resolved) ? inrGroup(resolved) : whole;
  });

  /**
   * Pass two: digit grouping.
   *
   * Longest first, so 15,00,000 is replaced before 5,00,000 could match
   * inside it.
   */
  const ordered = [...values].sort((a, b) => Math.abs(b) - Math.abs(a));
  for (const v of ordered) {
    const correct = inrGroup(v);
    const forms = new Set<string>([
      Math.abs(v).toString(),
      Math.abs(v).toLocaleString("en-US"),
      Math.abs(v).toLocaleString("en-IN"),
      correct,
    ]);
    for (const form of forms) {
      if (form === correct) continue;
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // The lookahead allows a sentence-ending full stop but refuses a decimal.
      out = out.replace(new RegExp("(?<![\\d,.])" + escaped + "(?![\\d,]|\\.\\d)", "g"), correct);
    }
  }

  return out;
}

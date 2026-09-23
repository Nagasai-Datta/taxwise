/**
 * How an answer is marked right or wrong.
 *
 * Scoring happens when the summary is built, not when the question is asked.
 * That way a scoring rule can be corrected and every stored answer re-marked
 * without spending another model call.
 *
 * The platform and the baseline are marked slightly differently, on purpose:
 *
 *   platform   the user-facing reply must state the expected figure (or the
 *              expected verdict). The guard already guarantees any figure it
 *              states came from a tool, so the question is whether it answered
 *              what was asked.
 *
 *   baseline   the model is told to finish with a line "ANSWER: <value>". Only
 *              that line is marked. This stops a reply that mentions the right
 *              figure in passing, then concludes something else, from being
 *              counted as correct.
 */

export type Kind = "amount" | "zero" | "yes" | "no" | "unreachable";

export interface Question {
  id: string;
  profile: string;
  question: string;
  kind: Kind;
  expected: number | null;
  tool: string;
  args: Record<string, unknown>;
  /** Which tool outputs hold the answer. */
  answerFacts: string[];
}

export type ToolOut = { tool: string; facts: Record<string, number | string> }[];

const SCALE: Record<string, number> = {
  crore: 1e7, crores: 1e7,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  million: 1e6, millions: 1e6,
  thousand: 1e3, thousands: 1e3, k: 1e3,
};

/** Every rupee-like number in a piece of text, with scale words resolved. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(crores?|lakhs?|lacs?|millions?|thousands?|k)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const mult = m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1;
    out.push(Math.round(base * mult));
  }
  return out;
}

/** Does the text say the tax is nothing? */
export function saysZero(text: string): boolean {
  return (
    /(?:₹|rs\.?|inr)\s?0(?![\d,.])/i.test(text) ||
    /\b(?:is|of|be|pay|owe|payable|comes? to|:)\s*(?:₹|rs\.?\s?)?0(?![\d,.])/i.test(text) ||
    /\b(zero|nil|nothing)\b/i.test(text) ||
    /\bno (?:income )?tax\b/i.test(text) ||
    /\b(?:not|won'?t|will not|don'?t|do not)\b[^.]{0,20}\bpay any\b/i.test(text)
  );
}

/** Read a yes or no out of the text. Negation is checked first. */
export function yesNo(text: string): "yes" | "no" | "unclear" {
  const t = text.toLowerCase();
  const negated =
    /\b(not|no longer|isn'?t|aren'?t|don'?t|do not|doesn'?t|does not|no need|not yet)\b[^.]{0,40}\b(required|mandatory|compulsory|need|have to|must|obliged)\b/.test(t) ||
    /\b(below|under|within) the (?:gst )?(?:registration )?threshold\b/.test(t) ||
    /\bbefore registration becomes (?:compulsory|mandatory|required)\b/.test(t) ||
    /^\s*no\b/.test(t);
  if (negated) return "no";
  if (/\b(yes|required|must register|need to register|have to register|mandatory|compulsory|obliged)\b/.test(t)) return "yes";
  if (/\b(above|over|exceeds?|crossed) the (?:gst )?(?:registration )?threshold\b/.test(t)) return "yes";
  return "unclear";
}

/** Does the text say the target cannot be reached? */
export function saysUnreachable(text: string): boolean {
  return /\b(cannot|can'?t|can not|not possible|unreachable|not reachable|not achievable|impossible|won'?t (?:be able to )?(?:reach|get)|will not (?:reach|get)|no amount of|not enough)\b/i.test(text);
}

/** The value on the baseline's final "ANSWER:" line, or null if there is none. */
export function finalAnswerLine(text: string): string | null {
  const re = /^[ \t>*_#-]*answer[ \t*_]*[:：][ \t]*(.+)$/gim;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) last = m[1].replace(/[*_`]/g, "").trim();
  return last;
}

export interface Mark {
  correct: boolean;
  /** What the answer was read as, for the per-answer table. */
  readAs: string;
  /** Baseline only: the model did not give a final ANSWER line. */
  noFinalLine?: boolean;
}

function markText(q: Question, text: string): Mark {
  switch (q.kind) {
    case "amount": {
      const nums = numbersIn(text);
      return { correct: nums.includes(q.expected as number), readAs: [...new Set(nums)].join(" ") };
    }
    case "zero": {
      const z = saysZero(text);
      return { correct: z, readAs: z ? "zero" : [...new Set(numbersIn(text))].join(" ") };
    }
    case "yes":
    case "no": {
      const v = yesNo(text);
      return { correct: v === q.kind, readAs: v };
    }
    case "unreachable": {
      const u = saysUnreachable(text);
      return { correct: u, readAs: u ? "unreachable" : [...new Set(numbersIn(text))].join(" ") };
    }
  }
}

/**
 * The platform is right when the tool that answers the question produced the
 * expected value AND the reply says it. The first half matters: a reply can
 * quote a genuine figure that happens to equal the expected one (the amount
 * actually deducted, say) while computing the thing asked about wrongly.
 */
export function markPlatform(q: Question, text: string, tools: ToolOut = []): Mark {
  const byText = markText(q, text);
  const holding = tools.flatMap((t) => q.answerFacts.filter((k) => k in t.facts).map((k) => t.facts[k]));
  if (holding.length === 0) return byText;
  const want: number | string =
    q.kind === "amount" || q.kind === "zero" ? (q.expected as number)
    : q.kind === "unreachable" ? "no"
    : q.kind;
  const computedRight = holding.some((v) => v === want);
  if (byText.correct && !computedRight) {
    return { correct: false, readAs: `${byText.readAs} (tool gave ${holding.join(" ")})` };
  }
  return byText;
}

export function markBaseline(q: Question, text: string): Mark {
  const line = finalAnswerLine(text);
  if (line === null) return { correct: false, readAs: "(no ANSWER line)", noFinalLine: true };
  if (q.kind === "amount") {
    // The first figure on the answer line is the answer.
    const n = numbersIn(line)[0];
    return { correct: n === q.expected, readAs: n === undefined ? line.slice(0, 40) : String(n) };
  }
  return markText(q, line);
}

/** For reproducibility: the figures an answer committed to, as a comparable key. */
export function figureKey(q: Question, text: string, condition: string): string {
  if (condition.startsWith("baseline")) {
    const line = finalAnswerLine(text);
    if (line === null) return "(none)";
    if (q.kind === "amount") return String(numbersIn(line)[0] ?? line.toLowerCase());
    return markText(q, line).readAs;
  }
  // The platform's wording varies between runs by design; its figures must not.
  return [...new Set(numbersIn(text))].sort((a, b) => a - b).join(" ");
}

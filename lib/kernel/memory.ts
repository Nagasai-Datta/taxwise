/**
 * The memory dossier.
 *
 * Memory answers a different question from the conversation list. A
 * conversation records what was said in one sitting. The dossier records what
 * the system knows about a person across all of them: what they prefer, what
 * they have decided, what they are still unsure about, and which concepts they
 * have already had explained.
 *
 * That last category is what makes the literacy objective real rather than
 * decorative. The Tutor can stop re-explaining what someone already
 * understands, and progress becomes something the user can see.
 *
 * This file is pure: it shapes and merges dossiers and knows nothing about the
 * database or the model. That keeps it testable on its own, like the rest of
 * the kernel.
 */

export type NoteKind = "preference" | "decision" | "question" | "fact";

export interface Note {
  kind: NoteKind;
  text: string;
  at: string;          // ISO timestamp
}

export interface ConceptRecord {
  id: string;
  title: string;
  times: number;       // how often it has been explained
  at: string;
}

export interface ToolRecord {
  tool: string;
  times: number;
  at: string;
}

export interface Dossier {
  notes: Note[];
  concepts: ConceptRecord[];
  tools: ToolRecord[];
  turns: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/** Lists are capped so a dossier cannot grow without bound in a long demo. */
const CAP_NOTES = 24;
const CAP_CONCEPTS = 60;
const CAP_TOOLS = 30;

export function emptyDossier(): Dossier {
  return { notes: [], concepts: [], tools: [], turns: 0, firstSeen: null, lastSeen: null };
}

/** Accepts anything previously stored, including an older or malformed shape. */
export function normalise(raw: unknown): Dossier {
  const d = (raw ?? {}) as Partial<Dossier>;
  return {
    notes: Array.isArray(d.notes) ? d.notes.filter(isNote).slice(0, CAP_NOTES) : [],
    concepts: Array.isArray(d.concepts) ? d.concepts.filter(isConcept).slice(0, CAP_CONCEPTS) : [],
    tools: Array.isArray(d.tools) ? d.tools.filter(isTool).slice(0, CAP_TOOLS) : [],
    turns: typeof d.turns === "number" ? d.turns : 0,
    firstSeen: typeof d.firstSeen === "string" ? d.firstSeen : null,
    lastSeen: typeof d.lastSeen === "string" ? d.lastSeen : null,
  };
}

function isNote(x: unknown): x is Note {
  const n = x as Note;
  return !!n && typeof n.text === "string" && n.text.length > 0 &&
    ["preference", "decision", "question", "fact"].includes(n.kind);
}
function isConcept(x: unknown): x is ConceptRecord {
  const c = x as ConceptRecord;
  return !!c && typeof c.id === "string" && typeof c.title === "string";
}
function isTool(x: unknown): x is ToolRecord {
  const t = x as ToolRecord;
  return !!t && typeof t.tool === "string";
}

export interface TurnObservation {
  /** Concepts the Tutor actually surfaced this turn. */
  concepts: { id: string; title: string }[];
  /** Tools that ran this turn. */
  tools: string[];
  /** A single note the model offered, if it offered one. */
  note: Note | null;
  at?: string;
}

/**
 * Fold one turn into a dossier.
 *
 * Pure and idempotent in shape: the same observation applied twice increments
 * counts rather than duplicating entries, which is what a person would expect
 * from "you have had this explained three times".
 */
export function applyTurn(prev: Dossier, obs: TurnObservation): Dossier {
  const at = obs.at ?? new Date().toISOString();
  const d: Dossier = {
    notes: [...prev.notes],
    concepts: [...prev.concepts],
    tools: [...prev.tools],
    turns: prev.turns + 1,
    firstSeen: prev.firstSeen ?? at,
    lastSeen: at,
  };

  for (const c of obs.concepts) {
    const i = d.concepts.findIndex((x) => x.id === c.id);
    if (i >= 0) d.concepts[i] = { ...d.concepts[i], times: d.concepts[i].times + 1, at };
    else d.concepts.unshift({ id: c.id, title: c.title, times: 1, at });
  }

  for (const t of obs.tools) {
    const i = d.tools.findIndex((x) => x.tool === t);
    if (i >= 0) d.tools[i] = { ...d.tools[i], times: d.tools[i].times + 1, at };
    else d.tools.unshift({ tool: t, times: 1, at });
  }

  if (obs.note) {
    // A note that repeats something already known is moved to the front rather
    // than stored twice.
    const same = (a: string, b: string) =>
      a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = d.notes.findIndex((n) => n.kind === obs.note!.kind && same(n.text, obs.note!.text));
    if (existing >= 0) d.notes.splice(existing, 1);
    d.notes.unshift({ ...obs.note, at });
  }

  d.notes = d.notes.slice(0, CAP_NOTES);
  d.concepts = d.concepts.slice(0, CAP_CONCEPTS);
  d.tools = d.tools.slice(0, CAP_TOOLS);
  return d;
}

/**
 * The dossier as a few lines for a system prompt.
 *
 * Deliberately short. A long dossier would crowd out the agent's actual
 * instructions, and the point is context rather than a transcript.
 */
export function asPromptContext(d: Dossier): string {
  if (d.turns === 0) return "";
  const parts: string[] = [];

  const byKind = (k: NoteKind) => d.notes.filter((n) => n.kind === k).slice(0, 3).map((n) => n.text);
  const prefs = byKind("preference");
  const decs = byKind("decision");
  const qs = byKind("question");
  const facts = byKind("fact");

  if (prefs.length) parts.push("They have said they prefer: " + prefs.join("; ") + ".");
  if (decs.length) parts.push("They have decided: " + decs.join("; ") + ".");
  if (facts.length) parts.push("Worth knowing: " + facts.join("; ") + ".");
  if (qs.length) parts.push("Still unsure about: " + qs.join("; ") + ".");

  const known = d.concepts.slice(0, 8).map((c) => c.title);
  if (known.length) {
    parts.push(
      "They have already had these explained, so do not start from scratch on them: " +
      known.join(", ") + "."
    );
  }

  return parts.join(" ");
}

/** Progress, for the interface. */
export function summarise(d: Dossier, corpusSize: number) {
  return {
    turns: d.turns,
    conceptsLearned: d.concepts.length,
    corpusSize,
    toolsUsed: d.tools.length,
    notes: d.notes.length,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
  };
}

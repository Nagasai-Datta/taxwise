import { describe, it, expect } from "vitest";
import {
  emptyDossier, normalise, applyTurn, asPromptContext, summarise,
} from "@/lib/kernel/memory";
import { extractNote } from "@/lib/agents/run";

describe("the dossier folds one turn at a time", () => {
  it("starts empty", () => {
    const d = emptyDossier();
    expect(d.turns).toBe(0);
    expect(d.notes).toHaveLength(0);
    expect(d.firstSeen).toBeNull();
  });

  it("counts turns and records when it first saw someone", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: ["compute_tax"], note: null });
    d = applyTurn(d, { concepts: [], tools: ["compare_regimes"], note: null });
    expect(d.turns).toBe(2);
    expect(d.firstSeen).not.toBeNull();
    expect(d.lastSeen).not.toBeNull();
  });

  it("increments a repeated concept rather than duplicating it", () => {
    let d = emptyDossier();
    const obs = { concepts: [{ id: "hra", title: "House rent allowance" }], tools: [], note: null };
    d = applyTurn(d, obs);
    d = applyTurn(d, obs);
    expect(d.concepts).toHaveLength(1);
    expect(d.concepts[0].times).toBe(2);
  });

  it("increments a repeated tool rather than duplicating it", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: ["compute_tax", "compute_tax"], note: null });
    expect(d.tools).toHaveLength(1);
    expect(d.tools[0].times).toBe(2);
  });

  it("moves a repeated note to the front instead of storing it twice", () => {
    let d = emptyDossier();
    const note = { kind: "preference" as const, text: "prefers the old regime", at: "" };
    d = applyTurn(d, { concepts: [], tools: [], note });
    d = applyTurn(d, { concepts: [], tools: [], note: { ...note, text: "Prefers the old regime." } });
    expect(d.notes).toHaveLength(1);
  });

  it("caps each list so a long session cannot grow it without bound", () => {
    let d = emptyDossier();
    for (let i = 0; i < 40; i++) {
      d = applyTurn(d, {
        concepts: [], tools: [],
        note: { kind: "fact", text: `distinct note number ${i}`, at: "" },
      });
    }
    expect(d.notes.length).toBeLessThanOrEqual(24);
    expect(d.notes[0].text).toContain("39");
  });
});

describe("normalise accepts anything previously stored", () => {
  it("survives null, an empty object and junk", () => {
    for (const raw of [null, undefined, {}, { notes: "nope" }, { concepts: 7 }]) {
      const d = normalise(raw);
      expect(Array.isArray(d.notes)).toBe(true);
      expect(Array.isArray(d.concepts)).toBe(true);
      expect(typeof d.turns).toBe("number");
    }
  });

  it("drops malformed entries but keeps valid ones", () => {
    const d = normalise({
      notes: [{ kind: "preference", text: "keeps this", at: "x" }, { kind: "nonsense", text: "drops" }, { kind: "fact" }],
      turns: 3,
    });
    expect(d.notes).toHaveLength(1);
    expect(d.turns).toBe(3);
  });
});

describe("the prompt context", () => {
  it("is empty before anything has happened", () => {
    expect(asPromptContext(emptyDossier())).toBe("");
  });

  it("tells the agent not to re-explain what was already covered", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [{ id: "hra", title: "House rent allowance" }], tools: [], note: null });
    expect(asPromptContext(d)).toContain("House rent allowance");
    expect(asPromptContext(d)).toMatch(/do not start from scratch/i);
  });

  it("separates preferences, decisions and open questions", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [], tools: [], note: { kind: "preference", text: "prefers the old regime", at: "" } });
    d = applyTurn(d, { concepts: [], tools: [], note: { kind: "question", text: "unsure about advance tax", at: "" } });
    const ctx = asPromptContext(d);
    expect(ctx).toMatch(/prefer/i);
    expect(ctx).toMatch(/unsure/i);
  });
});

describe("the note the model may offer", () => {
  it("parses a well-formed line", () => {
    const n = extractNote("Some answer.\nREMEMBER: preference | prefers the old regime because of rent");
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("preference");
    expect(n!.text).toBe("prefers the old regime because of rent");
  });

  it("accepts every valid kind", () => {
    for (const k of ["preference", "decision", "question", "fact"]) {
      expect(extractNote(`x\nREMEMBER: ${k} | something durable about them`)?.kind).toBe(k);
    }
  });

  it("rejects an unknown kind", () => {
    expect(extractNote("x\nREMEMBER: banana | something")).toBeNull();
  });

  it("rejects a note containing a figure, because notes are about the person", () => {
    expect(extractNote("x\nREMEMBER: fact | their tax came to 87,880 this year")).toBeNull();
  });

  it("rejects a note that is too short or too long", () => {
    expect(extractNote("x\nREMEMBER: fact | ab")).toBeNull();
    expect(extractNote("x\nREMEMBER: fact | " + "a".repeat(200))).toBeNull();
  });

  it("returns null when the model offers nothing", () => {
    expect(extractNote("Just a plain answer with no marker.")).toBeNull();
  });
});

describe("progress", () => {
  it("reports concepts learned against the corpus size", () => {
    let d = emptyDossier();
    d = applyTurn(d, { concepts: [{ id: "hra", title: "HRA" }, { id: "slab", title: "Slabs" }], tools: [], note: null });
    const s = summarise(d, 55);
    expect(s.conceptsLearned).toBe(2);
    expect(s.corpusSize).toBe(55);
  });
});

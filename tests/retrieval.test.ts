import { describe, it, expect } from "vitest";
import { CONCEPTS, searchLexical, corpusStats, tokenise } from "@/lib/kernel/concepts";
import { retrieve } from "@/lib/kernel/retrieval";

describe("the corpus", () => {
  it("has 55 concepts across seven categories", () => {
    const s = corpusStats();
    expect(s.count).toBe(55);
    expect(Object.keys(s.byCategory).length).toBe(7);
  });

  it("gives every concept an id, a title, aliases and a body", () => {
    for (const c of CONCEPTS) {
      expect(c.id).toBeTruthy();
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.aliases.length).toBeGreaterThan(0);
      expect(c.body.split(/\s+/).length).toBeGreaterThan(35);
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
  });

  /**
   * The load-bearing test. The Tutor may quote the corpus verbatim, so if the
   * corpus contained an amount the Tutor could state one, and objective 3
   * would be broken through the back door.
   */
  it("contains no rupee amounts, rates or thresholds anywhere", () => {
    const money = /(\u20B9|Rs\.?\s|INR\s)\s?\d/i;
    const scale = /\b\d[\d,]*\s?(lakh|crore|thousand)\b/i;
    const rate = /\b\d+(\.\d+)?\s?(per cent|percent|%)/i;
    for (const c of CONCEPTS) {
      expect({ id: c.id, money: money.test(c.body) }).toMatchObject({ money: false });
      expect({ id: c.id, scale: scale.test(c.body) }).toMatchObject({ scale: false });
      expect({ id: c.id, rate: rate.test(c.body) }).toMatchObject({ rate: false });
    }
  });

  it("names only tools that actually exist", async () => {
    const { TOOL_NAMES } = await import("@/lib/kernel/tools/registry");
    for (const c of CONCEPTS) {
      for (const t of c.relatedTools) expect(TOOL_NAMES).toContain(t);
    }
  });
});

describe("lexical retrieval", () => {
  const expected: [string, string][] = [
    ["what is HRA", "hra"],
    ["explain section 80C", "section-80c"],
    ["what is a tax slab", "what-is-a-slab"],
    ["should I use presumptive taxation", "presumptive-taxation"],
    ["what is GST", "what-is-gst"],
    ["why is my client cutting tax from my invoice", "section-194j"],
    ["what is an emergency fund", "emergency-fund"],
    ["what is compounding", "compounding"],
    ["do I need to register for GST", "gst-registration"],
    ["what is form 16", "form-16"],
  ];

  for (const [q, id] of expected) {
    it(`finds "${id}" for "${q}"`, () => {
      const hits = searchLexical(q, 3);
      expect(hits.map((h) => h.id)).toContain(id);
    });
  }

  it("ranks the obvious answer first for a direct question", () => {
    expect(searchLexical("what is HRA", 1)[0].id).toBe("hra");
    expect(searchLexical("what is net worth", 1)[0].id).toBe("net-worth");
  });

  it("returns nothing rather than noise for an unrelated question", () => {
    expect(searchLexical("what is the capital of France", 3)).toHaveLength(0);
  });

  it("strips stop words when tokenising", () => {
    expect(tokenise("what is the HRA")).toEqual(["hra"]);
  });
});

describe("retrieval falls back cleanly", () => {
  it("uses the lexical path when no database or embeddings exist", async () => {
    const r = await retrieve("what is a tax slab", 2);
    expect(["lexical", "vector"]).toContain(r.method);
    expect(r.hits.length).toBeGreaterThan(0);
  });

  it("reports honestly when nothing matches", async () => {
    const r = await retrieve("zzzz qqqq", 2);
    expect(r.method).toBe("none");
    expect(r.hits).toHaveLength(0);
  });
});

describe("ranking failures observed in live runs", () => {
  it("ranks the HRA explainer above the no-HRA one for 'what is HRA'", () => {
    // Measured failure: "Paying rent without a rent allowance" ranked first,
    // because "hra" appears in an alias of both concepts and the exact-phrase
    // bonus required an alias longer than three characters.
    for (const q of ["what is HRA", "what is HRA?", "explain HRA", "hra"]) {
      expect(searchLexical(q, 1)[0].id).toBe("hra");
    }
  });

  it("separates the winner clearly rather than tying", () => {
    const hits = searchLexical("what is HRA", 2);
    expect(hits[0].score).toBeGreaterThan(hits[1].score * 1.5);
  });

  it("prefers the registration explainer over the general one for a registration question", () => {
    expect(searchLexical("do I need to register for GST", 1)[0].id).toBe("gst-registration");
  });

  it("puts the exact subject first across a range of direct questions", () => {
    const cases: [string, string][] = [
      ["what is a tax slab", "what-is-a-slab"],
      ["explain section 80C", "section-80c"],
      ["what is compounding", "compounding"],
      ["what is an emergency fund", "emergency-fund"],
      ["what is net worth", "net-worth"],
      ["what is form 16", "form-16"],
      ["what is TDS", "what-is-tds"],
    ];
    for (const [q, id] of cases) expect({ q, got: searchLexical(q, 1)[0].id }).toMatchObject({ got: id });
  });
});

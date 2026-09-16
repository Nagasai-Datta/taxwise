import corpus from "@/data/concepts.json";

export interface Concept {
  id: string;
  title: string;
  category: string;
  level: string;
  aliases: string[];
  body: string;
  relatedTools: string[];
}

export interface ConceptHit extends Concept {
  score: number;
  method: "lexical" | "vector";
}

export const CONCEPTS = corpus.concepts as Concept[];

const STOP = new Set([
  "a","an","the","is","are","was","were","be","been","do","does","did","of","to","in","on","for",
  "and","or","but","if","it","its","this","that","these","those","i","me","my","we","you","your",
  "what","which","how","why","when","who","can","could","should","would","will","about","with",
  "at","by","from","as","so","than","then","there","here","more","much","many","tell","explain",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Lexical retrieval over the corpus.
 *
 * This is the path that always works: no key, no database, no embeddings.
 * Over 55 short documents a term-overlap score is genuinely competitive with
 * a vector search, because the vocabulary is small and the questions use the
 * same words the answers do. Vector search earns its place on phrasing the
 * corpus does not contain, which is why both exist rather than only one.
 *
 * Title and alias matches are weighted far above body matches: someone asking
 * "what is HRA" wants the HRA explainer, not the four others that mention it
 * in passing.
 */
export function searchLexical(query: string, limit = 3): ConceptHit[] {
  const terms = tokenise(query);
  if (terms.length === 0) return [];

  // A term appearing in few documents is more informative than one appearing
  // in many, so weight it accordingly.
  const df = new Map<string, number>();
  for (const t of terms) {
    let n = 0;
    for (const c of CONCEPTS) if (haystack(c).includes(t)) n++;
    df.set(t, n);
  }

  const scored = CONCEPTS.map((c) => {
    const title = tokenise(c.title);
    const aliases = c.aliases.flatMap(tokenise);
    const body = tokenise(c.body);
    let score = 0;

    for (const t of terms) {
      const seen = df.get(t) ?? CONCEPTS.length;
      const rarity = Math.log((CONCEPTS.length + 1) / (seen + 1)) + 0.5;
      if (aliases.includes(t)) score += 6 * rarity;
      if (title.includes(t)) score += 4 * rarity;
      const inBody = body.filter((b) => b === t).length;
      if (inBody) score += Math.min(3, inBody) * rarity;
    }

    /**
     * An exact alias match is the strongest signal there is, and it must
     * outweigh the sum of term overlaps. Measured failure: "what is HRA"
     * ranked "Paying rent without a rent allowance" above "House rent
     * allowance", because the token "hra" appears in an alias of both and the
     * exact-phrase bonus required an alias longer than three characters,
     * which "hra" is not.
     */
    const q = " " + query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";
    for (const a of c.aliases) {
      const alias = " " + a.toLowerCase().trim() + " ";
      if (alias.trim().length < 2) continue;
      if (q.includes(alias)) {
        // The whole question being an alias is stronger still.
        score += q.trim() === alias.trim() ? 60 : 25;
      }
    }
    // A title word that is also the subject of the question breaks remaining ties.
    for (const t of terms) if (title.includes(t)) score += 2;

    return { ...c, score, method: "lexical" as const };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

function haystack(c: Concept): string[] {
  return [...tokenise(c.title), ...c.aliases.flatMap(tokenise), ...tokenise(c.body)];
}

export function conceptById(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}

export function corpusStats() {
  const byCategory: Record<string, number> = {};
  for (const c of CONCEPTS) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  return { count: CONCEPTS.length, byCategory, words: CONCEPTS.reduce((s, c) => s + c.body.split(/\s+/).length, 0) };
}

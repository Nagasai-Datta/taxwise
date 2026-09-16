import { searchLexical, type ConceptHit } from "./concepts";

export interface RetrievalResult {
  hits: ConceptHit[];
  method: "vector" | "lexical" | "none";
  note: string;
}

/**
 * Retrieval, tried best-first and always landing somewhere useful.
 *
 * Vector search runs when embeddings have been generated and a database is
 * reachable. Otherwise the lexical path takes over, which needs neither. The
 * Tutor cannot tell the difference and neither can the user: both return the
 * same documents in the same shape, and neither can return a figure, because
 * the corpus does not contain one.
 */
export async function retrieve(query: string, limit = 3): Promise<RetrievalResult> {
  // Imported lazily so that the kernel keeps no static dependency on the
  // database layer. Nothing in lib/kernel should require a network to run.
  try {
    const { searchVector, vectorReady } = await import("@/lib/db/concepts");
    if (await vectorReady()) {
      const hits = await searchVector(query, limit);
      if (hits.length > 0) {
        return { hits, method: "vector", note: "Retrieved by meaning from the embedded corpus." };
      }
      // Embeddings exist but the query could not be embedded in time.
      // Lexical answers the same question in under a millisecond.
    }
  } catch {
    /* fall through to lexical */
  }

  const hits = searchLexical(query, limit);
  return {
    hits,
    method: hits.length ? "lexical" : "none",
    note: hits.length
      ? "Retrieved by term matching. Run npm run corpus:embed to enable retrieval by meaning."
      : "Nothing in the corpus matched that question.",
  };
}

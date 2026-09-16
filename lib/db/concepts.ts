import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "./client";
import { sql } from "drizzle-orm";
import { CONCEPTS, type ConceptHit } from "@/lib/kernel/concepts";
import { hasGemini } from "@/lib/agents/providers";

/**
 * Vector retrieval, layered on top of the lexical path rather than replacing it.
 *
 * The concepts table is created by scripts/corpus.ts using raw SQL rather than
 * through the Drizzle schema. That is deliberate: a vector column cannot be
 * created until the pgvector extension exists, and putting it in the main
 * schema would make `npm run db:push` fail for anyone who has not enabled the
 * extension yet. Keeping it separate means the rest of the database works
 * whether or not retrieval has been set up.
 */

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "gemini-embedding-001";

/**
 * How long a query embedding may take before retrieval gives up on it.
 *
 * Measured: embedding a Tutor question through Gemini took 3.9 seconds, which
 * was most of a 5.6 second reply. Lexical retrieval over 55 documents answers
 * the same question in under a millisecond and, for a direct question like
 * "what is HRA", returns the same document. Waiting four seconds to maybe
 * improve the ranking on an indirectly phrased question is a bad trade in
 * front of a person, so retrieval takes whichever is ready.
 *
 * Embedding the CORPUS has no timeout, because nobody is waiting for that.
 */
export const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 800);

/**
 * Query embeddings are cached for the life of the process. The same question
 * asked twice costs one call, which matters during a demonstration where the
 * same few questions are asked repeatedly.
 */
const queryCache = new Map<string, number[]>();

export function embeddingModel() {
  if (!hasGemini()) return null;
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string,
  }).textEmbeddingModel(EMBEDDING_MODEL);
}

/** Used when embedding the corpus. No timeout: nobody is waiting. */
export async function embedOne(text: string): Promise<number[] | null> {
  const m = embeddingModel();
  if (!m) return null;
  try {
    const { embedding } = await embed({ model: m, value: text });
    return embedding;
  } catch {
    return null;
  }
}

/** Used when embedding a user's question. Cached, and abandoned if slow. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const key = text.trim().toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;

  const m = embeddingModel();
  if (!m) return null;
  try {
    const { embedding } = await embed({
      model: m,
      value: text,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    queryCache.set(key, embedding);
    return embedding;
  } catch {
    return null;   // retrieval falls through to the lexical path
  }
}

/** Whether the concepts table exists and has rows. */
export async function vectorReady(): Promise<boolean> {
  const d = db();
  if (!d) return false;
  try {
    const r = await d.execute(sql`select count(*)::int as n from concepts`);
    const rows = r as unknown as { n: number }[];
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function searchVector(query: string, limit = 3): Promise<ConceptHit[]> {
  const d = db();
  if (!d) return [];
  const vec = await embedQuery(query);
  if (!vec) return [];

  try {
    const literal = `[${vec.join(",")}]`;
    const r = await d.execute(sql`
      select id, 1 - (embedding <=> ${literal}::vector) as score
      from concepts
      order by embedding <=> ${literal}::vector
      limit ${limit}
    `);
    const rows = r as unknown as { id: string; score: number }[];
    const hits: ConceptHit[] = [];
    for (const row of rows) {
      const c = CONCEPTS.find((x) => x.id === row.id);
      if (c) hits.push({ ...c, score: Number(row.score), method: "vector" });
    }
    return hits;
  } catch {
    return [];
  }
}

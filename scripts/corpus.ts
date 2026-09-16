/**
 * Embeds the concept corpus into Supabase so retrieval can work by meaning.
 *
 *   npm run corpus:embed     generate embeddings and store them
 *   npm run corpus:check     report what is currently stored
 *
 * The table is created here with raw SQL rather than through the Drizzle
 * schema, because a vector column cannot exist until the pgvector extension
 * does, and requiring that would break `npm run db:push` for anyone who has
 * not enabled it. The dimension is discovered by embedding one document first
 * rather than assumed, because embedding models change their defaults.
 */
import "../lib/env";
import { sql } from "drizzle-orm";
import { db, hasDatabase } from "../lib/db/client";
import { embedOne, EMBEDDING_MODEL } from "../lib/db/concepts";
import { CONCEPTS, corpusStats, searchLexical } from "../lib/kernel/concepts";
import { hasGemini } from "../lib/agents/providers";

const check = process.argv.includes("--check");

async function main() {
  const s = corpusStats();
  console.log("");
  console.log(`CORPUS   ${s.count} concepts, ${s.words} words`);
  console.log("  " + Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join("   "));
  console.log("");

  const d = db();

  if (check) {
    if (!d) { console.log("  No database. Retrieval will use the lexical path."); console.log(""); return; }
    try {
      const r = await d.execute(sql`select count(*)::int as n from concepts`);
      const n = (r as unknown as { n: number }[])[0]?.n ?? 0;
      console.log(`  Stored embeddings: ${n} of ${s.count}`);
      console.log(n >= s.count ? "  Retrieval by meaning is active." : "  Run: npm run corpus:embed");
    } catch {
      console.log("  The concepts table does not exist yet. Run: npm run corpus:embed");
    }
    console.log("");
    return;
  }

  if (!hasDatabase() || !d) {
    console.log("  DATABASE_URL is not set, so there is nowhere to store embeddings.");
    console.log("  Retrieval will use the lexical path, which needs neither a database nor a key.");
    console.log("");
    demo();
    return;
  }
  if (!hasGemini()) {
    console.log("  GOOGLE_GENERATIVE_AI_API_KEY is not set, so embeddings cannot be generated.");
    console.log("  Retrieval will use the lexical path.");
    console.log("");
    demo();
    return;
  }

  console.log(`  Embedding with ${EMBEDDING_MODEL}`);

  // Discover the dimension rather than assume it.
  const probe = await embedOne(CONCEPTS[0].title + ". " + CONCEPTS[0].body);
  if (!probe) {
    console.log("");
    console.log("  The embedding call failed. Check GOOGLE_GENERATIVE_AI_API_KEY, or set");
    console.log("  EMBEDDING_MODEL in .env.local to a model your key can reach.");
    console.log("");
    return;
  }
  const dim = probe.length;
  console.log(`  Vector dimension: ${dim}`);

  try {
    await d.execute(sql`create extension if not exists vector`);
  } catch {
    console.log("");
    console.log("  Could not enable the pgvector extension. In the Supabase dashboard open");
    console.log("  the SQL editor and run:   create extension if not exists vector;");
    console.log("  Then run this again. Retrieval works lexically in the meantime.");
    console.log("");
    return;
  }

  await d.execute(sql.raw(`drop table if exists concepts`));
  await d.execute(sql.raw(`
    create table concepts (
      id text primary key,
      title text not null,
      category text not null,
      body text not null,
      embedding vector(${dim}) not null
    )
  `));
  console.log("  Table created");

  let done = 0;
  for (const c of CONCEPTS) {
    const vec = c.id === CONCEPTS[0].id ? probe : await embedOne(c.title + ". " + c.body);
    if (!vec) { console.log(`    skipped ${c.id}`); continue; }
    await d.execute(sql`
      insert into concepts (id, title, category, body, embedding)
      values (${c.id}, ${c.title}, ${c.category}, ${c.body}, ${`[${vec.join(",")}]`}::vector)
    `);
    done++;
    if (done % 10 === 0) console.log(`    ${done} of ${CONCEPTS.length}`);
  }

  // An index is not strictly needed at this size, but it is what the design
  // calls for and it costs nothing to create.
  try {
    await d.execute(sql.raw(`create index concepts_embedding_idx on concepts using ivfflat (embedding vector_cosine_ops) with (lists = 10)`));
    console.log("  Index created");
  } catch {
    console.log("  Index not created. At this corpus size it changes nothing.");
  }

  console.log("");
  console.log(`  Stored ${done} embeddings. Retrieval by meaning is now active.`);
  console.log("");
  demo();
}

function demo() {
  console.log("  Lexical retrieval, as a sanity check:");
  for (const q of ["what is HRA", "should I use presumptive taxation", "how do I save more"]) {
    const hits = searchLexical(q, 2);
    console.log(`    "${q}"`);
    for (const h of hits) console.log(`        ${h.score.toFixed(1).padStart(6)}  ${h.title}`);
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

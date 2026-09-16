import "./lib/env";
import { requireEnv } from "./lib/env";
import type { Config } from "drizzle-kit";

/**
 * Migrations run through the SESSION pooler (port 5432), not the transaction
 * pooler. Creating and altering tables uses features that transaction pooling
 * does not carry between statements, so pushing a schema through port 6543
 * fails in ways that are hard to read.
 *
 * requireEnv exits with an explanation rather than letting drizzle-kit report
 * an empty url, which tells you nothing about why it is empty.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: requireEnv("DIRECT_URL") },
  /**
   * The concepts table is created by scripts/corpus.ts with raw SQL, because a
   * vector column cannot exist until the pgvector extension does, and putting
   * it in this schema would break db:push for anyone who has not enabled it.
   *
   * drizzle-kit treats any table it does not manage as one that should not
   * exist, so without this filter a push offers to DROP it, taking every
   * embedding with it. Excluding it here means push never sees it.
   */
  tablesFilter: ["!concepts"],
  verbose: true,
  strict: true,
} satisfies Config;

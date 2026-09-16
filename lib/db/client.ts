import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The database connection.
 *
 * prepare: false is required. Supabase's transaction pooler does not support
 * prepared statements, and without this flag queries fail intermittently with
 * "prepared statement already exists" once more than one request is in flight.
 *
 * The connection is created lazily and cached. If DATABASE_URL is absent the
 * whole module returns null and every repository falls back to the seed files,
 * which is what keeps the application working with no database at all.
 */

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;
let attempted = false;

export function hasDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  return !!url && url.startsWith("postgres");
}

export function db() {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;

  if (!hasDatabase()) return null;

  const client = postgres(process.env.DATABASE_URL as string, {
    prepare: false,          // required for the transaction pooler
    max: 5,                  // free tier pool is small; be a good citizen
    idle_timeout: 20,
    connect_timeout: 10,
    // Postgres emits a NOTICE for things like "table does not exist, skipping"
    // on a drop-if-exists. They are not errors and printing them alarms people.
    onnotice: () => {},
  });
  cached = drizzle(client, { schema });
  return cached;
}

export { schema };

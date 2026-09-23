/**
 * Imported before anything else. The evaluation runs on the seed data, so
 * every run starts from the same state and nothing is written to Supabase.
 * Setting the variable to empty here means .env.local cannot switch it back.
 */
process.env.DATABASE_URL = "";

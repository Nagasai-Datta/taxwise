/**
 * Environment loading for standalone scripts and drizzle-kit.
 *
 * Next.js reads .env.local automatically, but plain Node scripts do not:
 * dotenv's default target is .env, so a value sitting in .env.local is
 * invisible to drizzle-kit and to anything run through tsx. This module
 * loads .env.local first and .env second. dotenv does not overwrite a
 * variable that is already set, so .env.local wins, which is the order
 * Next.js itself uses.
 *
 * Import this before anything that reads process.env.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error("");
    console.error(`  ${name} is empty.`);
    console.error("");
    console.error("  Open .env.local and fill it in:   open -e .env.local");
    console.error("");
    console.error("  In Supabase, click Connect at the top of the dashboard.");
    console.error("    DATABASE_URL  = Transaction pooler string, port 6543");
    console.error("    DIRECT_URL    = Session pooler string,     port 5432");
    console.error("");
    console.error("  Replace [YOUR-PASSWORD] entirely, square brackets included,");
    console.error("  and delete ?pgbouncer=true from the end if it is there.");
    console.error("");
    process.exit(1);
  }
  return v;
}

export function envStatus() {
  const shown = (v?: string) =>
    !v || v.trim() === "" ? "EMPTY" : v.replace(/:[^:@]+@/, ":****@").slice(0, 62) + "...";
  return {
    DATABASE_URL: shown(process.env.DATABASE_URL),
    DIRECT_URL: shown(process.env.DIRECT_URL),
    ok: !!process.env.DATABASE_URL?.trim() && !!process.env.DIRECT_URL?.trim(),
  };
}

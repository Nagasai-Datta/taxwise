#!/usr/bin/env bash
#  TaxWise - fix: db:push must never drop the concepts table
#
#  What happened: the concepts table is created by scripts/corpus.ts with raw
#  SQL, because a vector column cannot exist until the pgvector extension does,
#  and putting it in the Drizzle schema would break db:push for anyone who has
#  not enabled that extension.
#
#  drizzle-kit treats any table it does not manage as one that should not
#  exist. So a push offered to DROP concepts, and took all 55 embeddings with
#  it. That was my oversight, not yours.
#
#  This adds tablesFilter to the drizzle config so push never sees that table
#  again. Then re-embed the corpus, which takes about a minute.
#
#  Run from INSIDE the project:
#      cd ~/Desktop/taxwise
#      mv ~/Downloads/fix-concepts-dropped.sh .
#      chmod +x fix-concepts-dropped.sh && ./fix-concepts-dropped.sh
set -euo pipefail
B=$'\033[1m'; DM=$'\033[2m'; G=$'\033[32m'; A=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
say(){ printf "%s\n" "${B}$1${X}"; }; note(){ printf "%s\n" "${DM}    $1${X}"; }
ok(){ printf "%s\n" "${G}  OK  $1${X}"; }; warn(){ printf "%s\n" "${A}  !!  $1${X}"; }
die(){ printf "%s\n" "${R}  XX  $1${X}"; exit 1; }
echo; say "Fix: protect the concepts table from db:push"; echo
[ -f package.json ] || die "Run this from inside the taxwise folder."
[ -f drizzle.config.ts ] || die "drizzle.config.ts not found."
wf(){ mkdir -p "$(dirname "$1")"; cat > "$1"; note "$1"; }

wf "drizzle.config.ts" <<'TW_EOF'
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
TW_EOF


echo
ok "drizzle config patched"
echo
say "Re-embedding the corpus"
note "about a minute, 55 calls to the embedding model"
echo
npm run corpus:embed || warn "embedding failed; retrieval will use term matching, which still works"
echo
npm run corpus:check || true
echo
say "Done"; echo
note "From now on db:push will leave the concepts table alone."
note "If a future push ever offers to drop it again, say NO and tell me."
echo

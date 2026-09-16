import { NextResponse } from "next/server";
import { findProfile, readMemory } from "@/lib/db/repositories";
import { groupedFor } from "@/lib/kernel/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/capabilities?profileId=X
 *
 * What this person can ask for, plus which of those they have already used.
 * The second half comes from memory, which turns the pane from a menu into a
 * map: a confused user can see where they have been and what is left.
 */
export async function GET(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const p = await findProfile(profileId);
  if (!p) return NextResponse.json({ error: "unknown profile" }, { status: 404 });

  const dossier = await readMemory(profileId);
  const used: Record<string, number> = {};
  for (const t of dossier.tools) used[t.tool] = t.times;

  return NextResponse.json({
    occupation: p.occupation,
    groups: groupedFor(p.occupation),
    used,
  });
}

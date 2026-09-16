import { NextResponse } from "next/server";
import { readMemory, clearMemory } from "@/lib/db/repositories";
import { summarise } from "@/lib/kernel/memory";
import { CONCEPTS } from "@/lib/kernel/concepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/memory?profileId=X   the dossier and a progress summary. */
export async function GET(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  const dossier = await readMemory(profileId);
  return NextResponse.json({ dossier, summary: summarise(dossier, CONCEPTS.length) });
}

/** DELETE /api/memory?profileId=X   forget everything about one profile. */
export async function DELETE(req: Request) {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  await clearMemory(profileId);
  return NextResponse.json({ cleared: true });
}

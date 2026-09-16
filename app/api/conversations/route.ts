import { NextResponse } from "next/server";
import { listConversations, listMessages, deleteConversation } from "@/lib/db/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations?profileId=X            list a profile's conversations
 * GET /api/conversations?profileId=X&id=Y       open one, with its messages
 *
 * Every query is scoped by profile. There is no authentication in this build,
 * which is deliberate and recorded as out of scope, so scoping is enforced by
 * always filtering on profileId rather than by trusting the caller.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") ?? "";
  const id = url.searchParams.get("id");

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  if (id) {
    const all = await listConversations(profileId);
    const owned = all.find((c) => c.id === id);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ conversation: owned, messages: await listMessages(id) });
  }

  return NextResponse.json({ conversations: await listConversations(profileId) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!profileId || !id) return NextResponse.json({ error: "profileId and id required" }, { status: 400 });
  return NextResponse.json({ deleted: await deleteConversation(id, profileId) });
}

import Chat from "@/components/Chat";
import { listProfiles } from "@/lib/db/repositories";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ profile?: string; ask?: string }> }) {
  const { profile, ask } = await searchParams;
  const profiles = (await listProfiles()).map((p) => ({
    id: p.id, name: p.name, jobTitle: p.jobTitle, occupation: p.occupation,
  }));
  // A service on the profile page raises a question; it arrives here as a link
  // rather than being answered there, so every answer still comes from the chat.
  return <Chat profiles={profiles} initialProfileId={profile} initialAsk={ask} />;
}

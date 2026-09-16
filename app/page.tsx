import Chat from "@/components/Chat";
import { listProfiles } from "@/lib/db/repositories";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profiles = (await listProfiles()).map((p) => ({
    id: p.id, name: p.name, jobTitle: p.jobTitle, occupation: p.occupation,
  }));
  return <Chat profiles={profiles} />;
}

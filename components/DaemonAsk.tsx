"use client";
import { useRouter } from "next/navigation";
import Daemons from "./Daemons";

/**
 * A question raised by a service goes to the chat, like everything else.
 * The services report; they never compute an answer themselves.
 */
export default function DaemonAsk({ profileId }: { profileId: string }) {
  const router = useRouter();
  return (
    <Daemons
      profileId={profileId}
      onAsk={(q) => router.push(`/?profile=${encodeURIComponent(profileId)}&ask=${encodeURIComponent(q)}`)}
    />
  );
}

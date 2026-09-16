"use client";
import { useRouter } from "next/navigation";

export default function ProfilePicker({
  profiles, current,
}: { profiles: { id: string; name: string; jobTitle: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/profile?id=${e.target.value}`)}
      className="rounded border border-rule bg-white px-2 py-1 text-[10.5px]"
    >
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>{p.name} &middot; {p.jobTitle}</option>
      ))}
    </select>
  );
}

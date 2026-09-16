"use client";

export interface ConversationSummary { id: string; title: string; updatedAt: string }

/**
 * The conversation list.
 *
 * Scoped to one profile: switching profile replaces the list entirely, because
 * every query filters on profileId. There is no authentication in this build,
 * which is recorded as out of scope, so separation is enforced by that filter
 * rather than by a session.
 */
export default function ConversationList({
  conversations, activeId, onOpen, onNew, onDelete, unavailable,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  unavailable?: boolean;
}) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-rule bg-white">
      <div className="border-b border-rule p-2">
        <button
          onClick={onNew}
          className="w-full rounded border border-ink bg-ink px-2 py-1.5 text-[11px] font-medium text-white hover:bg-ink/90"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {unavailable && (
          <p className="px-1 py-6 text-center text-[10px] leading-snug text-ink/40">
            No database connected, so conversations are not saved. The chat still works
            and every figure is unchanged.
          </p>
        )}

        {!unavailable && conversations.length === 0 && (
          <p className="px-1 py-6 text-center text-[10px] leading-snug text-ink/40">
            No conversations yet. Ask something and it will appear here.
          </p>
        )}

        {conversations.map((c) => (
          <div
            key={c.id}
            className={"group mb-1 flex items-center gap-1 rounded px-2 py-1.5 " +
              (c.id === activeId ? "bg-panel" : "hover:bg-panel/60")}
          >
            <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[11px] text-ink">{c.title}</span>
              <span className="block text-[9px] text-ink/40">{when(c.updatedAt)}</span>
            </button>
            <button
              onClick={() => onDelete(c.id)}
              aria-label="Delete conversation"
              className="shrink-0 px-1 text-[11px] text-ink/25 opacity-0 hover:text-red-600 group-hover:opacity-100"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

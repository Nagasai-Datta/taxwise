"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList, { type ConversationSummary } from "./ConversationList";
import FunctionPane from "./FunctionPane";
import AnswerDetail, { type ResultPayload, type Step, type Route } from "./AnswerDetail";
import ModeToggle, { type Mode } from "./ModeToggle";
import { renderWidget } from "./widgets";
import { KIND_LABEL, type FollowUp } from "@/lib/agents/followups";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  agent?: string;
  provider?: string;
  results?: ResultPayload[];
  component?: string;
  mode?: Mode;
  degraded?: boolean;
  failed?: boolean;
  suggestions?: FollowUp[];
  suggestionSource?: "model" | "fixed";
  approach?: string;
  explain?: { text: string; results: ResultPayload[]; loading?: boolean } | null;
  route?: Route | null;
  steps?: Step[];
  guard?: { ok: boolean; offending: string[] } | null;
  totalMs?: number;
}

interface ProfileOption { id: string; name: string; jobTitle: string; occupation: string }

export default function Chat({
  profiles, initialProfileId, initialAsk,
}: { profiles: ProfileOption[]; initialProfileId?: string; initialAsk?: string }) {
  const [profileId, setProfileId] = useState(
    profiles.find((p) => p.id === initialProfileId)?.id ?? profiles[0]?.id ?? "PRIYA-001"
  );
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noDb, setNoDb] = useState(false);
  // Bumped after every answer so the pane re-reads which capabilities were used.
  const [paneKey, setPaneKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];

  const loadConversations = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/conversations?profileId=${encodeURIComponent(pid)}`);
      const j = await res.json();
      setConversations(j.conversations ?? []);
    } catch {
      setConversations([]);
    }
  }, []);

  // Switching profile replaces the whole workspace: a different person's
  // conversations, and none of the previous one's messages.
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    loadConversations(profileId);
  }, [profileId, loadConversations]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // A question handed over from a service on the profile page. Sent once.
  const asked = useRef(false);
  useEffect(() => {
    if (initialAsk && !asked.current) {
      asked.current = true;
      send(initialAsk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  async function openConversation(id: string) {
    setConversationId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/conversations?profileId=${encodeURIComponent(profileId)}&id=${id}`);
      const j = await res.json();
      const loaded: Message[] = (j.messages ?? []).map((m: Record<string, unknown>) => {
        const p = (m.payload ?? {}) as Record<string, unknown>;
        return {
          id: m.id as string,
          role: m.role as "user" | "assistant",
          text: m.content as string,
          agent: (m.agent as string) ?? undefined,
          provider: (m.provider as string) ?? undefined,
          component: (m.component as string) ?? undefined,
          mode: (m.mode as Mode) ?? "text",
          results: (p.results as ResultPayload[]) ?? [],
          steps: (p.steps as Step[]) ?? [],
          route: (p.route as Route) ?? null,
          guard: (p.guard as Message["guard"]) ?? null,
          suggestions: (p.suggestions as string[]) ?? [],
          suggestionSource: p.suggestionSource as "model" | "fixed" | undefined,
          approach: (p.approach as string) ?? undefined,
          degraded: p.degraded as boolean | undefined,
          totalMs: p.totalMs as number | undefined,
        };
      });
      setMessages(loaded);
    } catch { /* leave empty */ }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
  }

  async function removeConversation(id: string) {
    setConversations((c) => c.filter((x) => x.id !== id));
    if (id === conversationId) newChat();
    try {
      await fetch(`/api/conversations?profileId=${encodeURIComponent(profileId)}&id=${id}`, { method: "DELETE" });
    } catch { /* the list is already updated */ }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const key = Math.random().toString(36).slice(2);
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: key + "u", role: "user", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, profileId, conversationId }),
      });
      const j = await res.json();

      if (j.error) {
        setMessages((m) => [...m, { id: key, role: "assistant", text: j.error, failed: true }]);
        return;
      }

      if (j.conversationId && j.conversationId !== conversationId) {
        setConversationId(j.conversationId);
      }
      if (!j.conversationId) setNoDb(true);

      setMessages((m) => [...m, {
        id: key, role: "assistant", text: j.text,
        agent: j.agent, provider: j.provider,
        results: j.results ?? [], component: j.component,
        mode: j.component && j.component !== "none" ? "interactive" : "text",
        degraded: j.degraded,
        suggestions: j.suggestions ?? [],
        suggestionSource: j.suggestionSource,
        approach: j.approach,
        route: j.route ?? null, steps: j.steps ?? [], guard: j.guard ?? null,
        totalMs: j.totalMs,
      }]);

      loadConversations(profileId);
      setPaneKey((k) => k + 1);
    } catch {
      setMessages((m) => [...m, {
        id: key, role: "assistant",
        text: "The request failed. Is the dev server still running?", failed: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * A form the assistant asked for, coming back filled in. The tool is called
   * again with these values, through the same doorway as any other call.
   */
  async function submitInput(tool: string, values: Record<string, string | number>) {
    if (busy) return;
    const key = Math.random().toString(36).slice(2);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, conversationId, resumeTool: tool, values }),
      });
      const j = await res.json();
      if (j.error) {
        setMessages((m) => [...m, { id: key, role: "assistant", text: j.error, failed: true }]);
        return;
      }
      setMessages((m) => [...m, {
        id: key, role: "assistant", text: j.text,
        agent: j.agent, provider: j.provider,
        results: j.results ?? [], component: j.component,
        mode: "interactive",
        approach: j.approach,
        route: null, steps: [], guard: j.guard ?? null,
        suggestions: [], suggestionSource: "fixed",
      }]);
      loadConversations(profileId);
      setPaneKey((k) => k + 1);
    } catch {
      setMessages((m) => [...m, {
        id: key, role: "assistant",
        text: "The request failed. Is the dev server still running?", failed: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  async function explain(id: string) {
    const msg = messages.find((m) => m.id === id);
    const tools = (msg?.results ?? []).map((r) => r.tool);
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, explain: { text: "", results: [], loading: true } } : x)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, explainTools: tools.length ? tools : ["compute_tax"] }),
      });
      const j = await res.json();
      setMessages((m) => m.map((x) => (x.id === id
        ? { ...x, explain: { text: j.text ?? "", results: j.results ?? [], loading: false } } : x)));
    } catch {
      setMessages((m) => m.map((x) => (x.id === id
        ? { ...x, explain: { text: "Could not load an explanation.", results: [], loading: false } } : x)));
    }
  }

  const setMode = (id: string, mode: Mode) =>
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, mode } : x)));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold tracking-tight text-ink">TaxWise</span>
          <span className="text-[9.5px] text-ink/45">FY 2025-26 &middot; simulated data</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/profile?id=${profileId}`} className="text-[10px] text-indigo hover:underline">profile</a>
          <a href="/gateway" className="text-[10px] text-ink/45 hover:text-ink hover:underline">payments</a>
          <a href="/status" className="text-[10px] text-ink/45 hover:text-ink hover:underline">status</a>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="rounded border border-rule bg-white px-2 py-1 text-[10.5px]"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name} &middot; {p.jobTitle}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          onOpen={openConversation}
          onNew={newChat}
          onDelete={removeConversation}
          unavailable={noDb}
        />

        <FunctionPane
          profileId={profileId}
          onAsk={send}
          busy={busy}
          refreshKey={paneKey}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-[#F7F9FC]">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 && (
                <div className="py-14 text-center">
                  <p className="text-sm font-semibold text-ink">Ask about {profile?.name}&apos;s money.</p>
                  <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-snug text-ink/50">
                    Pick something from <span className="font-medium">what you can do</span> on the left,
                    or type a question. If you are not sure where to begin, just type <span className="font-medium">help</span>.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[10.5px] leading-snug text-ink/40">
                    Every figure is computed by a rule engine, not by the language model. Open
                    &ldquo;how this was answered&rdquo; under any reply to see which rule produced it.
                  </p>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className="mb-5">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-lg bg-ink px-3 py-2 text-[12px] text-white">{m.text}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-amber/15 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-amber">
                          {m.agent}
                        </span>
                        {m.degraded && (
                          <span className="rounded bg-ink/8 px-1.5 py-px text-[8.5px] font-bold uppercase text-ink/50">
                            deterministic phrasing
                          </span>
                        )}
                      </div>

                      {m.approach && (
                        <p className="mb-1.5 border-l-2 border-teal/40 pl-2 text-[10.5px] leading-snug text-ink/50">
                          {m.approach}
                        </p>
                      )}

                      <p className={"text-[12.5px] leading-relaxed " + (m.failed ? "text-red-700" : "text-ink/85")}>
                        {m.text}
                      </p>

                      {m.results && m.results.length > 0 && (
                        <>
                          <div className="mt-2">
                            <ModeToggle mode={m.mode ?? "text"} onChange={(mode) => setMode(m.id, mode)} />
                          </div>
                          {(m.mode === "interactive" || m.component === "input_form") && (
                            <div className="mt-2 space-y-2">
                              {m.results.map((r, i) => (
                                <div key={i}>{renderWidget(r.component, r.data, r.facts, r.trace, send, submitInput, busy)}</div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <AnswerDetail
                        route={m.route ?? null}
                        steps={m.steps ?? []}
                        results={m.results ?? []}
                        guard={m.guard ?? null}
                        provider={m.provider}
                        totalMs={m.totalMs}
                      />

                      {!m.failed && m.agent !== "tutor" && (
                        <button
                          onClick={() => explain(m.id)}
                          disabled={busy || m.explain?.loading}
                          className="mt-2 text-[10px] font-semibold text-teal hover:underline disabled:opacity-40"
                        >
                          {m.explain ? "\u25BE explain this" : "\u25B8 explain this"}
                        </button>
                      )}

                      {m.explain && (
                        <div className="mt-1.5 rounded border border-teal/30 bg-teal/[0.03] p-2.5">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="rounded bg-teal/15 px-1.5 py-px text-[8.5px] font-bold uppercase text-teal">tutor</span>
                            <span className="text-[9px] text-ink/40">the ideas behind that answer</span>
                          </div>
                          {m.explain.loading ? (
                            <p className="text-[11px] text-ink/40">Looking it up...</p>
                          ) : (
                            <>
                              <p className="text-[11.5px] leading-relaxed text-ink/80">{m.explain.text}</p>
                              {m.explain.results.map((r, i) => (
                                <div key={i} className="mt-2">{renderWidget(r.component, r.data, r.facts, r.trace, send, submitInput, busy)}</div>
                              ))}
                            </>
                          )}
                        </div>
                      )}

                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="mt-2.5">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[9px] uppercase tracking-wide text-ink/35">where to go next</span>
                            <span className={"rounded px-1 py-px text-[8px] font-bold uppercase " +
                              (m.suggestionSource === "model" ? "bg-teal/15 text-teal" : "bg-ink/8 text-ink/45")}>
                              {m.suggestionSource === "model" ? "suggested" : "standard"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.suggestions.map((f) => (
                              <button key={f.text} onClick={() => send(f.text)} disabled={busy}
                                className="rounded-full border border-rule bg-white px-2.5 py-1 text-left text-[10px] hover:bg-panel disabled:opacity-40">
                                <span className="mr-1.5 text-[8px] font-bold uppercase text-ink/35">{KIND_LABEL[f.kind]}</span>
                                <span className="text-ink/75">{f.text}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[11px] text-ink/45">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                  routing, calling the kernel, checking the reply
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-rule bg-white px-6 py-3">
            <div className="mx-auto max-w-3xl">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ask a question"
                  className="flex-1 rounded border border-rule px-3 py-2 text-[12.5px] outline-none focus:border-indigo"
                />
                <button onClick={() => send(input)} disabled={busy}
                  className="rounded bg-ink px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-40">
                  Send
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

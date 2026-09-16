import { eq } from "drizzle-orm";
import { db, hasDatabase } from "./client";
import { and, desc, eq as eqq } from "drizzle-orm";
import { profiles, accounts, transactions, goals, auditLog, memory, tasks, conversations, chatMessages } from "./schema";
import { allProfiles as seedProfiles, type Profile } from "@/lib/kernel/profiles";
import type { TraceNode } from "@/lib/kernel/types";
import { type Dossier, emptyDossier, normalise } from "@/lib/kernel/memory";

/**
 * Every read of persisted data goes through this file.
 *
 * Each function tries the database first and falls back to the seed fixtures
 * when no database is configured. The fallback is not a convenience: it is what
 * lets the kernel and the agents be exercised with nothing but a laptop, and it
 * means a paused or unreachable database cannot stop a demonstration.
 */

export type DataSource = "database" | "seed";

export async function source(): Promise<DataSource> {
  if (!hasDatabase()) return "seed";
  try {
    const d = db();
    if (!d) return "seed";
    await d.select({ id: profiles.id }).from(profiles).limit(1);
    return "database";
  } catch {
    return "seed";
  }
}

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    name: r.name as string,
    age: r.age as number,
    occupation: r.occupation as Profile["occupation"],
    jobTitle: r.jobTitle as string,
    city: r.city as string,
    isMetro: r.isMetro as boolean,
    exercises: r.exercises as string,
    rentMonthly: r.rentMonthly as number,
    income: r.income as Profile["income"],
    deductions: r.deductions as Record<string, number>,
    bank: { name: "", maskedNumber: "", balance: 0, type: "personal" },
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const d = db();
  if (!d) return seedProfiles();
  try {
    const rows = await d.select().from(profiles);
    if (rows.length === 0) return seedProfiles();
    return rows.map((r) => rowToProfile(r as unknown as Record<string, unknown>));
  } catch {
    return seedProfiles();
  }
}

export async function findProfile(id: string): Promise<Profile | undefined> {
  return (await listProfiles()).find((p) => p.id.toUpperCase() === id.toUpperCase());
}

export async function listAccounts(profileId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(accounts).where(eq(accounts.profileId, profileId));
  } catch {
    return [];
  }
}

export async function listTransactions(accountId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(transactions).where(eq(transactions.accountId, accountId));
  } catch {
    return [];
  }
}

export async function listGoals(profileId: string) {
  const d = db();
  if (!d) return [];
  try {
    return await d.select().from(goals).where(eq(goals.profileId, profileId));
  } catch {
    return [];
  }
}

/**
 * Append one tool invocation to the audit log. This is the only writer of that
 * table and the only mechanism by which a trace comes into existence.
 * Failure to record is swallowed deliberately: losing a log line must never
 * suppress a correct answer the user is waiting for.
 */
export async function recordToolCall(entry: {
  profileId: string;
  taskId?: string;
  toolName: string;
  args: unknown;
  facts: Record<string, number | string>;
  trace: TraceNode | null;
  durationMs: number;
}): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.insert(auditLog).values({
      profileId: entry.profileId,
      taskId: entry.taskId ?? null,
      toolName: entry.toolName,
      args: entry.args as object,
      facts: entry.facts as object,
      trace: (entry.trace ?? {}) as object,
      durationMs: entry.durationMs,
    });
  } catch {
    /* logging must never break an answer */
  }
}

/**
 * The dossier for one profile.
 *
 * Returns an empty dossier rather than null when there is nothing stored or no
 * database, so every caller can treat memory as always present and never has
 * to branch on its absence.
 */
export async function readMemory(profileId: string): Promise<Dossier> {
  const d = db();
  if (!d) return emptyDossier();
  try {
    const rows = await d.select().from(memory).where(eqq(memory.profileId, profileId)).limit(1);
    return normalise(rows[0]?.dossier);
  } catch {
    return emptyDossier();
  }
}

export async function writeMemory(profileId: string, dossier: Dossier): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.insert(memory).values({ profileId, dossier: dossier as unknown as object })
      .onConflictDoUpdate({
        target: memory.profileId,
        set: { dossier: dossier as unknown as object, updatedAt: new Date() },
      });
  } catch { /* memory must never break an answer */ }
}

export async function clearMemory(profileId: string): Promise<void> {
  await writeMemory(profileId, emptyDossier());
}

export async function createTask(profileId: string, title: string, agent?: string) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(tasks).values({ profileId, title, agent, status: "running" }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function finishTask(taskId: string, status: "completed" | "failed") {
  const d = db();
  if (!d) return;
  try {
    await d.update(tasks).set({ status, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  } catch { /* ignore */ }
}

/* ====================================================== conversations */

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent: string | null;
  provider: string | null;
  mode: string | null;
  component: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** A title a person will still recognise later, taken from the first message. */
export function titleFrom(message: string): string {
  const t = message.trim().replace(/\s+/g, " ");
  if (t.length <= 48) return t;
  return t.slice(0, 45).replace(/[,;:\s]+\S*$/, "") + "...";
}

export async function listConversations(profileId: string): Promise<ConversationSummary[]> {
  const d = db();
  if (!d) return [];
  try {
    const rows = await d.select().from(conversations)
      .where(eqq(conversations.profileId, profileId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map((r) => ({
      id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function createConversation(profileId: string, firstMessage: string) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(conversations)
      .values({ profileId, title: titleFrom(firstMessage) }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function touchConversation(conversationId: string) {
  const d = db();
  if (!d) return;
  try {
    await d.update(conversations).set({ updatedAt: new Date() })
      .where(eqq(conversations.id, conversationId));
  } catch { /* ignore */ }
}

export async function deleteConversation(conversationId: string, profileId: string) {
  const d = db();
  if (!d) return false;
  try {
    // Scoped by profile as well as id, so one profile can never delete
    // another's conversation even if an id leaks.
    await d.delete(conversations).where(
      and(eqq(conversations.id, conversationId), eqq(conversations.profileId, profileId))
    );
    return true;
  } catch {
    return false;
  }
}

export async function listMessages(conversationId: string): Promise<StoredMessage[]> {
  const d = db();
  if (!d) return [];
  try {
    const rows = await d.select().from(chatMessages)
      .where(eqq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
    return rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      agent: r.agent,
      provider: r.provider,
      mode: r.mode,
      component: r.component,
      payload: (r.payload as Record<string, unknown>) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function appendMessage(m: {
  conversationId: string;
  profileId: string;
  role: "user" | "assistant";
  content: string;
  agent?: string | null;
  provider?: string | null;
  mode?: string | null;
  component?: string | null;
  payload?: unknown;
}) {
  const d = db();
  if (!d) return null;
  try {
    const rows = await d.insert(chatMessages).values({
      conversationId: m.conversationId,
      profileId: m.profileId,
      role: m.role,
      content: m.content,
      agent: m.agent ?? null,
      provider: m.provider ?? null,
      mode: m.mode ?? null,
      component: m.component ?? null,
      payload: (m.payload ?? null) as object,
    }).returning();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

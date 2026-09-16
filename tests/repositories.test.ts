import { describe, it, expect } from "vitest";
import { listProfiles, findProfile, source, recordToolCall, readMemory } from "@/lib/db/repositories";
import { hasDatabase } from "@/lib/db/client";
import { allProfiles } from "@/lib/kernel/profiles";

/**
 * These assert the FALLBACK path, which is the one that must never break.
 * They run without a database and without a network.
 */
describe("repositories fall back cleanly with no database", () => {
  it("reports the seed source when DATABASE_URL is absent", async () => {
    if (hasDatabase()) return;                 // skip when a real database is configured
    expect(await source()).toBe("seed");
  });

  it("returns all three fixtures", async () => {
    const p = await listProfiles();
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.id).sort()).toEqual(allProfiles().map((x) => x.id).sort());
  });

  it("finds a profile case-insensitively", async () => {
    expect((await findProfile("priya-001"))?.name).toBe("Priya");
    expect((await findProfile("PRIYA-001"))?.name).toBe("Priya");
  });

  it("returns undefined for an unknown profile rather than throwing", async () => {
    expect(await findProfile("NOBODY-999")).toBeUndefined();
  });

  it("never throws when recording a tool call without a database", async () => {
    await expect(recordToolCall({
      profileId: "PRIYA-001", toolName: "compute_tax",
      args: {}, facts: { totalTax: 0 }, trace: null, durationMs: 3,
    })).resolves.toBeUndefined();
  });

  it("returns an empty dossier rather than null, so callers never branch on absence", async () => {
    if (hasDatabase()) return;
    const d = await readMemory("PRIYA-001");
    expect(d.turns).toBe(0);
    expect(d.notes).toEqual([]);
    expect(d.concepts).toEqual([]);
  });
});

describe("conversation titles", () => {
  it("uses a short message unchanged", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    expect(titleFrom("Which regime is better for me?")).toBe("Which regime is better for me?");
  });

  it("truncates a long message at a word boundary", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    const t = titleFrom("I want to understand whether the old regime or the new regime saves me more money this year");
    expect(t.length).toBeLessThanOrEqual(48);
    expect(t.endsWith("...")).toBe(true);
    expect(t).not.toMatch(/\s\.\.\.$/);
  });

  it("collapses whitespace", async () => {
    const { titleFrom } = await import("@/lib/db/repositories");
    expect(titleFrom("  what   is   80C?  ")).toBe("what is 80C?");
  });
});

describe("conversations degrade without a database", () => {
  it("returns an empty list rather than throwing", async () => {
    const { listConversations } = await import("@/lib/db/repositories");
    expect(await listConversations("PRIYA-001")).toEqual([]);
  });

  it("returns null when creating without a database", async () => {
    const { createConversation } = await import("@/lib/db/repositories");
    expect(await createConversation("PRIYA-001", "hello there")).toBeNull();
  });

  it("never throws when appending a message without a database", async () => {
    const { appendMessage } = await import("@/lib/db/repositories");
    await expect(appendMessage({
      conversationId: "x", profileId: "PRIYA-001", role: "user", content: "hi",
    })).resolves.toBeNull();
  });
});

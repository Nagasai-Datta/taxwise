import {
  pgTable, text, integer, bigint, boolean, timestamp, jsonb, uuid, index,
} from "drizzle-orm/pg-core";

/**
 * Layer 5, the data layer.
 *
 * Two rules govern this schema.
 *
 * Rupee amounts are stored as whole-rupee integers, never as floating point.
 * The kernel rounds to whole rupees at every step because the Act requires it,
 * and a float would reintroduce the imprecision that rounding removed.
 *
 * Anything the kernel needs in order to compute is a real column. Anything the
 * kernel only carries around is jsonb. That keeps the columns that matter
 * queryable and typed, without inventing a table for every nested shape.
 */

/* ------------------------------------------------------------ profiles */
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),                       // PRIYA-001
  name: text("name").notNull(),
  age: integer("age").notNull(),
  occupation: text("occupation").notNull(),          // salaried | business | profession
  jobTitle: text("job_title").notNull(),
  city: text("city").notNull(),
  isMetro: boolean("is_metro").notNull(),
  exercises: text("exercises").notNull(),            // which rules this fixture covers
  rentMonthly: bigint("rent_monthly", { mode: "number" }).notNull(),
  income: jsonb("income").notNull(),                 // gross, basic, HRA, turnover, receipts
  deductions: jsonb("deductions").notNull(),         // { "80C": 50000, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------ accounts */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  bankName: text("bank_name").notNull(),
  maskedNumber: text("masked_number").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
  accountType: text("account_type").notNull(),       // personal | business
}, (t) => [index("accounts_profile_idx").on(t.profileId)]);

/* -------------------------------------------------------- transactions */
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  direction: text("direction").notNull(),            // credit | debit
  merchant: text("merchant").notNull(),
  category: text("category").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  // Distinguishes pre-seeded history from rows injected live during a demo.
  source: text("source").notNull().default("seeded"),
}, (t) => [index("transactions_account_idx").on(t.accountId)]);

/* --------------------------------------------------------------- goals */
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
  currentAmount: bigint("current_amount", { mode: "number" }).notNull().default(0),
  targetDate: text("target_date"),
});

/* ------------------------------------------------------- conversations */
/**
 * A conversation is the unit a user actually works in, in the way a chat
 * application works: a list on the left, click to reopen, a button to start a
 * new one. Everything is scoped to one profile, so switching profile switches
 * the entire list.
 */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  // Taken from the first message, which is the cheapest title that is still
  // recognisable a week later.
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("conversations_profile_idx").on(t.profileId)]);

/* ------------------------------------------------------- chat messages */
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                      // user | assistant
  content: text("content").notNull(),
  agent: text("agent"),                              // which agent answered
  provider: text("provider"),                        // which model, or deterministic
  mode: text("mode"),                                // text | interactive
  component: text("component"),                      // registry key, when interactive
  /**
   * Everything needed to redraw the answer exactly as it first appeared:
   * tool results with their facts and traces, the routing decision, the agent
   * steps, the guard verdict and the follow-up suggestions. Stored together
   * because it is always read together and never queried into.
   */
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("chat_conversation_idx").on(t.conversationId),
  index("chat_profile_idx").on(t.profileId),
]);

/* --------------------------------------------------------------- tasks */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"), // pending|running|completed|failed
  agent: text("agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ----------------------------------------------------------- audit log */
/**
 * One row per tool invocation. This table IS the verifiable trace: nothing
 * else is written to produce it. Objective 3 is satisfied by the fact that
 * a figure cannot reach the user without a row appearing here first.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull(),
  toolName: text("tool_name").notNull(),
  args: jsonb("args").notNull(),
  facts: jsonb("facts").notNull(),                   // every number the tool produced
  trace: jsonb("trace").notNull(),                   // the TraceNode tree
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_task_idx").on(t.taskId)]);

/* -------------------------------------------------------------- memory */
export const memory = pgTable("memory", {
  profileId: text("profile_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  dossier: jsonb("dossier").notNull(),               // preferences, decisions, open questions
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConversationRow = typeof conversations.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // UUID string
    task: text("task").notNull().default(""),
    status: text("status").notNull().default("Created"),
    repoPath: text("repo_path").notNull().default(""),
    branch: text("branch"),
    autoApprove: integer("auto_approve", { mode: "boolean" }).notNull().default(false),
    noPr: integer("no_pr", { mode: "boolean" }).notNull().default(false),
    prUrl: text("pr_url"),
    backendType: text("backend_type").notNull().default("copilot"),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_sessions_status").on(table.status),
    index("idx_sessions_created_at").on(table.createdAt),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    sender: text("sender").notNull().default(""),
    channelType: text("channel_type"),
    content: text("content").notNull().default(""),
    messageType: text("message_type").notNull().default("Message"),
    timestamp: text("timestamp").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_messages_session_id").on(table.sessionId),
    index("idx_messages_timestamp").on(table.timestamp),
  ],
);

export const sessionChannels = sqliteTable(
  "session_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    channelType: text("channel_type").notNull().default(""),
    systemInstruction: text("system_instruction"),
    lastStatusRequestAt: text("last_status_request_at"),
    addedAt: text("added_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("idx_session_channels_unique").on(table.sessionId, table.channelType),
  ],
);

export const globalChannels = sqliteTable(
  "global_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channelType: text("channel_type").notNull().default(""),
    name: text("name").notNull().default(""),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    configurationJson: text("configuration_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_global_channels_type").on(table.channelType),
    uniqueIndex("idx_global_channels_type_name").on(table.channelType, table.name),
  ],
);

// Type helpers
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type SessionChannel = typeof sessionChannels.$inferSelect;
export type NewSessionChannel = typeof sessionChannels.$inferInsert;
export type GlobalChannel = typeof globalChannels.$inferSelect;
export type NewGlobalChannel = typeof globalChannels.$inferInsert;

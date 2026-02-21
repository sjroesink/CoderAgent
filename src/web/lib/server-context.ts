import { Server as SocketIOServer } from "socket.io";
import { createDb, type Db } from "../../core/data/db";
import { sql } from "drizzle-orm";
import { SessionManager } from "../../core/services/session-manager";
import { StatusSummarizer } from "../../core/services/status-summarizer";
import { GlobalChannelService } from "../../core/services/global-channel-service";
import { GitHubService } from "../../core/services/github-service";

// Use globalThis to share singletons between the custom server (server.ts) and
// Next.js bundled API routes, which resolve module scope independently.
const g = globalThis as unknown as {
  _db?: Db;
  _io?: SocketIOServer;
  _sessionManager?: SessionManager;
  _statusSummarizer?: StatusSummarizer;
  _globalChannelService?: GlobalChannelService;
  _githubService?: GitHubService;
};

export function initDb(): Db {
  if (!g._db) {
    g._db = createDb(process.env.DATABASE_PATH ?? "agentcoder.db");

    // Ensure tables exist
    g._db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Created',
      repo_path TEXT NOT NULL DEFAULT '',
      branch TEXT,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      no_pr INTEGER NOT NULL DEFAULT 0,
      pr_url TEXT,
      backend_type TEXT NOT NULL DEFAULT 'copilot',
      github_repo TEXT,
      base_branch TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Add new columns to existing databases (safe: IF NOT EXISTS-style via pragma)
    try { g._db.run(sql`ALTER TABLE sessions ADD COLUMN github_repo TEXT`); } catch {}
    try { g._db.run(sql`ALTER TABLE sessions ADD COLUMN base_branch TEXT`); } catch {}

    g._db.run(sql`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender TEXT NOT NULL DEFAULT '',
      channel_type TEXT,
      content TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'Message',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    g._db.run(sql`CREATE TABLE IF NOT EXISTS session_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      channel_type TEXT NOT NULL DEFAULT '',
      system_instruction TEXT,
      last_status_request_at TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    g._db.run(sql`CREATE TABLE IF NOT EXISTS global_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_type TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      configuration_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }
  return g._db;
}

export function getSessionManager(): SessionManager {
  if (!g._sessionManager) {
    g._sessionManager = new SessionManager(initDb());
  }
  return g._sessionManager;
}

export function getStatusSummarizer(): StatusSummarizer {
  if (!g._statusSummarizer) {
    g._statusSummarizer = new StatusSummarizer(initDb());
  }
  return g._statusSummarizer;
}

export function getGlobalChannelService(): GlobalChannelService {
  if (!g._globalChannelService) {
    g._globalChannelService = new GlobalChannelService(initDb());
  }
  return g._globalChannelService;
}

export function getGitHubService(): GitHubService {
  if (!g._githubService) {
    g._githubService = new GitHubService(process.env.WORKSPACES_ROOT ?? "/data/workspaces");
  }
  return g._githubService;
}

export function getIO(): SocketIOServer | null {
  return g._io ?? null;
}

export function setIO(io: SocketIOServer): void {
  g._io = io;
}

import { Server as SocketIOServer } from "socket.io";
import { createDb, type Db } from "../../core/data/db";
import { sql } from "drizzle-orm";
import { SessionManager } from "../../core/services/session-manager";
import { StatusSummarizer } from "../../core/services/status-summarizer";
import { GlobalChannelService } from "../../core/services/global-channel-service";

let _db: Db | null = null;
let _io: SocketIOServer | null = null;
let _sessionManager: SessionManager | null = null;
let _statusSummarizer: StatusSummarizer | null = null;
let _globalChannelService: GlobalChannelService | null = null;

export function initDb(): Db {
  if (!_db) {
    _db = createDb("agentcoder.db");

    // Ensure tables exist
    _db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Created',
      repo_path TEXT NOT NULL DEFAULT '',
      branch TEXT,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      no_pr INTEGER NOT NULL DEFAULT 0,
      pr_url TEXT,
      backend_type TEXT NOT NULL DEFAULT 'copilot',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    _db.run(sql`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender TEXT NOT NULL DEFAULT '',
      channel_type TEXT,
      content TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'Message',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    _db.run(sql`CREATE TABLE IF NOT EXISTS session_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      channel_type TEXT NOT NULL DEFAULT '',
      system_instruction TEXT,
      last_status_request_at TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    _db.run(sql`CREATE TABLE IF NOT EXISTS global_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_type TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      configuration_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }
  return _db;
}

export function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager(initDb());
  }
  return _sessionManager;
}

export function getStatusSummarizer(): StatusSummarizer {
  if (!_statusSummarizer) {
    _statusSummarizer = new StatusSummarizer(initDb());
  }
  return _statusSummarizer;
}

export function getGlobalChannelService(): GlobalChannelService {
  if (!_globalChannelService) {
    _globalChannelService = new GlobalChannelService(initDb());
  }
  return _globalChannelService;
}

export function getIO(): SocketIOServer | null {
  return _io;
}

export function setIO(io: SocketIOServer): void {
  _io = io;
}

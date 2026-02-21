import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { eq, desc } from "drizzle-orm";
import { type Db } from "../data/db";
import { sessions, messages, sessionChannels } from "../data/schema";
import type { Session, Message } from "../data/schema";
import { ChannelType } from "../channels/channel";
import type { MultiChannel } from "../channels/multi-channel";
import type { WebUIChannel } from "../channels/webui-channel";
import { AgentOrchestrator } from "../orchestrator";
import type { StatusSummarizer } from "./status-summarizer";
import type { AgentBackendType } from "../agents/agent-backend";

export interface SessionCreateRequest {
  task: string;
  repoPath: string;
  branch?: string;
  autoApprove: boolean;
  noPr: boolean;
  backendType: AgentBackendType;
  channels: ChannelRequest[];
}

export interface ChannelRequest {
  type: ChannelType;
  systemInstruction?: string;
}

interface ActiveSession {
  id: string;
  orchestrator: AgentOrchestrator;
  multiChannel: MultiChannel;
  runningTask: Promise<void>;
}

export class SessionManager extends EventEmitter {
  private db: Db;
  private activeSessions = new Map<string, ActiveSession>();

  constructor(db: Db) {
    super();
    this.db = db;
  }

  async createSession(request: SessionCreateRequest): Promise<string> {
    const sessionId = uuidv4();

    await this.db.insert(sessions).values({
      id: sessionId,
      task: request.task,
      repoPath: request.repoPath,
      branch: request.branch,
      autoApprove: request.autoApprove,
      noPr: request.noPr,
      backendType: request.backendType,
      status: "Created",
    });

    // Always add WebUI channel
    await this.db.insert(sessionChannels).values({
      sessionId,
      channelType: ChannelType.WebUI,
    });

    for (const ch of request.channels) {
      await this.db.insert(sessionChannels).values({
        sessionId,
        channelType: ch.type,
        systemInstruction: ch.systemInstruction,
      });
    }

    return sessionId;
  }

  async startSession(
    sessionId: string,
    multiChannel: MultiChannel,
    statusSummarizer?: StatusSummarizer,
  ): Promise<void> {
    const session = await this.getSessionEntity(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Check if already active
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already running.`);
    }

    await this.updateSessionStatus(sessionId, "Initializing");

    const orchestrator = new AgentOrchestrator(
      multiChannel,
      session.repoPath,
      sessionId,
      session.autoApprove,
      (session.backendType as AgentBackendType) ?? "copilot",
      statusSummarizer,
    );

    const runningTask = (async () => {
      try {
        await orchestrator.initialize();
        await this.updateSessionStatus(sessionId, "Running");
        await orchestrator.sendTask(session.task);
        await orchestrator.runInteractiveSession();

        if (!session.noPr && session.branch) {
          const prUrl = await orchestrator.createPullRequest(session.branch, session.task);
          if (prUrl) {
            await this.db
              .update(sessions)
              .set({ prUrl, updatedAt: new Date().toISOString() })
              .where(eq(sessions.id, sessionId));
          }
        }

        await this.updateSessionStatus(sessionId, "Completed");
      } catch (err: any) {
        console.error(`Session ${sessionId} failed: ${err.message}`);
        await this.updateSessionStatus(sessionId, "Failed");
      } finally {
        this.activeSessions.delete(sessionId);
        await orchestrator.dispose();
      }
    })();

    this.activeSessions.set(sessionId, {
      id: sessionId,
      orchestrator,
      multiChannel,
      runningTask,
    });
  }

  async persistMessage(
    sessionId: string,
    channelType: string,
    sender: string,
    content: string,
    messageType: string,
  ): Promise<void> {
    await this.db.insert(messages).values({
      sessionId,
      channelType,
      sender,
      content,
      messageType,
    });

    // Update session's updatedAt
    await this.db
      .update(sessions)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, sessionId));

    this.emit("messagePersisted", sessionId, channelType, sender, content, messageType);
  }

  sendUserMessage(sessionId: string, message: string): void {
    const active = this.activeSessions.get(sessionId);
    if (active) {
      const webUi = active.multiChannel.getWebUIChannel();
      webUi?.enqueueUserMessage(message);
    }
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  async getAllSessions(): Promise<Session[]> {
    return this.db.query.sessions.findMany({
      orderBy: [desc(sessions.createdAt)],
    });
  }

  async getSessionEntity(sessionId: string): Promise<Session | undefined> {
    return this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
  }

  async getSessionMessages(sessionId: string, limit?: number): Promise<Message[]> {
    const query = this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.timestamp);

    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async getSessionChannels(sessionId: string) {
    return this.db
      .select()
      .from(sessionChannels)
      .where(eq(sessionChannels.sessionId, sessionId));
  }

  async waitForSession(sessionId: string): Promise<void> {
    const active = this.activeSessions.get(sessionId);
    if (active) {
      await active.runningTask;
    }
  }

  private async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, sessionId));

    this.emit("sessionStatusChanged", sessionId, status);
  }
}

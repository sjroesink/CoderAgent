import { eq, and, gt } from "drizzle-orm";
import type { Db } from "../data/db";
import { messages, sessionChannels } from "../data/schema";
import type { Message } from "../data/schema";
import { type AgentBackendType, createAgentBackend } from "../agents/agent-backend";

/**
 * Uses a lightweight agent to summarize session progress since the last
 * status request on a given channel.
 */
export class StatusSummarizer {
  private db: Db;
  private backendType: AgentBackendType;

  constructor(db: Db, backendType: AgentBackendType = "copilot") {
    this.db = db;
    this.backendType = backendType;
  }

  async summarizeForChannel(
    sessionId: string,
    channelType: string,
    systemInstruction?: string,
  ): Promise<string> {
    // Get last status request time for this channel
    const channelEntries = await this.db
      .select()
      .from(sessionChannels)
      .where(
        and(
          eq(sessionChannels.sessionId, sessionId),
          eq(sessionChannels.channelType, channelType),
        ),
      );

    const channelEntity = channelEntries[0];
    if (!channelEntity) {
      return "Channel not found for this session.";
    }

    const since = channelEntity.lastStatusRequestAt ?? channelEntity.addedAt;

    // Get all messages since the last status request
    const recentMessages = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          gt(messages.timestamp, since),
        ),
      )
      .orderBy(messages.timestamp);

    // Update last status request timestamp
    await this.db
      .update(sessionChannels)
      .set({ lastStatusRequestAt: new Date().toISOString() })
      .where(eq(sessionChannels.id, channelEntity.id));

    if (recentMessages.length === 0) {
      return "No new activity since your last status request.";
    }

    const conversationLog = formatConversationLog(recentMessages);
    const prompt = buildSummaryPrompt(conversationLog, systemInstruction);

    return this.callSummaryAgent(prompt);
  }

  private async callSummaryAgent(prompt: string): Promise<string> {
    const backend = await createAgentBackend(this.backendType);
    try {
      await backend.initialize({
        workspacePath: process.cwd(),
        mcpServers: {},
        autoApprove: true,
        agentId: "status-summarizer",
        agentName: "Status Summarizer",
        agentDescription: "Summarizes agent progress for status updates.",
      });

      const session = await backend.createSession();
      return await backend.run(prompt, session);
    } finally {
      await backend.dispose();
    }
  }
}

function formatConversationLog(msgs: Message[]): string {
  return msgs
    .map((m) => {
      const time = m.timestamp.substring(11, 19); // HH:mm:ss from ISO string
      return `[${time}] [${m.sender}] (${m.messageType}): ${m.content}`;
    })
    .join("\n");
}

function buildSummaryPrompt(conversationLog: string, systemInstruction?: string): string {
  let prompt = `Summarize the following agent activity log concisely.
Focus on: what was accomplished, what is currently in progress, and what remains.
Be brief but informative. Use the same language as the conversation log.

Activity log:
${conversationLog}`;

  if (systemInstruction) {
    prompt = `Additional instruction: ${systemInstruction}\n\n${prompt}`;
  }

  return prompt;
}

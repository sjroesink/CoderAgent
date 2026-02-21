import OpenAI from "openai";
import type { IAgentBackend, AgentConfig, AgentSessionHandle } from "./agent-backend";

/**
 * OpenAI Codex backend implementation.
 * Uses OpenAI's API with code-davinci-002 or gpt-4 models for agent operations.
 */
export class CodexBackend implements IAgentBackend {
  private client: OpenAI | null = null;
  private config: AgentConfig | null = null;
  private conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  async initialize(config: AgentConfig): Promise<void> {
    this.config = config;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for Codex backend");
    }

    this.client = new OpenAI({
      apiKey,
    });
  }

  async createSession(): Promise<AgentSessionHandle> {
    if (!this.client || !this.config) {
      throw new Error("Backend not initialized. Call initialize() first.");
    }

    // Initialize conversation with system message
    this.conversationHistory = [
      {
        role: "system",
        content: `You are an AI coding assistant with access to the workspace at ${this.config.workspacePath}. Help the user with coding tasks, explain code, fix bugs, and write new features.`,
      },
    ];

    const id = `codex-${Date.now()}`;
    return { id };
  }

  async run(prompt: string, _session: AgentSessionHandle): Promise<string> {
    if (!this.client || !this.config) {
      throw new Error("Backend not initialized.");
    }

    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: prompt,
    });

    try {
      // Use gpt-4 or gpt-3.5-turbo for chat completions
      // Note: code-davinci-002 (original Codex) is deprecated, so we use chat models
      const completion = await this.client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4",
        messages: this.conversationHistory,
        temperature: 0.2, // Lower temperature for more focused coding responses
        max_tokens: 4000,
      });

      const assistantMessage = completion.choices[0]?.message?.content || "";

      // Add assistant response to history
      this.conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
      });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 21) {
        // Keep system message + last 20 messages
        this.conversationHistory = [
          this.conversationHistory[0],
          ...this.conversationHistory.slice(-20),
        ];
      }

      return assistantMessage;
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async dispose(): Promise<void> {
    this.client = null;
    this.config = null;
    this.conversationHistory = [];
  }
}

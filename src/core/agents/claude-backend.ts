import { spawn } from "child_process";
import type { IAgentBackend, AgentConfig, AgentSessionHandle } from "./agent-backend";

/**
 * Claude Agent SDK backend implementation.
 * Uses @anthropic-ai/claude-agent-sdk's query() function for agent operations.
 */
export class ClaudeBackend implements IAgentBackend {
  private config: AgentConfig | null = null;
  private sessionId: string | null = null;
  private queryFn: any = null;
  private abortController: AbortController | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.config = config;
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    this.queryFn = sdk.query;
  }

  async createSession(): Promise<AgentSessionHandle> {
    if (!this.config) {
      throw new Error("Backend not initialized. Call initialize() first.");
    }

    const id = `claude-${Date.now()}`;
    this.sessionId = null;
    return { id };
  }

  async run(prompt: string, _session: AgentSessionHandle): Promise<string> {
    if (!this.config || !this.queryFn) {
      throw new Error("Backend not initialized.");
    }

    // Build MCP servers in Claude SDK format
    const mcpServers: Record<string, any> = {};
    for (const [name, server] of Object.entries(this.config.mcpServers)) {
      if (server.type === "local" || server.type === "stdio") {
        mcpServers[name] = {
          command: server.command,
          args: server.args,
          env: server.env,
        };
      } else {
        mcpServers[name] = {
          type: server.type,
          url: server.url,
        };
      }
    }

    this.abortController = new AbortController();

    const options: any = {
      cwd: this.config.workspacePath,
      mcpServers,
      allowedTools: ["*"],
      maxTurns: 30,
      abortController: this.abortController,
      // Custom spawn: merge system env (fixes Windows PATH/ENOENT issues)
      // and remove CLAUDECODE var to allow nested sessions.
      spawnClaudeCodeProcess: (spawnOpts: any) => {
        const cmd = spawnOpts.command === "node" ? process.execPath : spawnOpts.command;
        const env = { ...process.env, ...spawnOpts.env };
        delete env.CLAUDECODE;
        return spawn(cmd, spawnOpts.args, {
          cwd: spawnOpts.cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
      },
    };

    if (this.config.autoApprove) {
      options.permissionMode = "bypassPermissions";
      options.allowDangerouslySkipPermissions = true;
    } else {
      options.permissionMode = "acceptEdits";
    }

    // Resume existing session if we have one
    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    let result = "";
    const queryResult = this.queryFn({ prompt, options });

    for await (const message of queryResult) {
      // Capture session ID
      if (message.session_id && !this.sessionId) {
        this.sessionId = message.session_id;
      }

      // Collect assistant text
      if (message.type === "assistant" && message.content) {
        if (typeof message.content === "string") {
          result = message.content;
        } else if (Array.isArray(message.content)) {
          const textBlocks = message.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text);
          if (textBlocks.length > 0) {
            result = textBlocks.join("\n");
          }
        }
      }

      // Get final result
      if (message.type === "result") {
        if (message.subtype === "success" && message.result) {
          result = message.result;
        } else if (message.subtype !== "success") {
          const errorInfo = message.result || message.error || message.subtype;
          throw new Error(`Claude query failed (${message.subtype}): ${errorInfo}`);
        }
      }
    }

    return result;
  }

  async dispose(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.config = null;
    this.sessionId = null;
    this.queryFn = null;
  }
}

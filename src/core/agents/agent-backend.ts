export type AgentBackendType = "copilot" | "claude" | "codex";

export interface McpServerConfig {
  type: "local" | "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  tools?: string[];
  timeout?: number;
}

export interface AgentConfig {
  workspacePath: string;
  mcpServers: Record<string, McpServerConfig>;
  autoApprove: boolean;
  agentId?: string;
  agentName?: string;
  agentDescription?: string;
}

/** Opaque handle representing an agent session. */
export interface AgentSessionHandle {
  id: string;
}

/**
 * Abstraction over different AI agent backends.
 * Allows swapping between GitHub Copilot SDK and Claude Agent SDK.
 */
export interface IAgentBackend {
  /** Initialize the backend client. */
  initialize(config: AgentConfig): Promise<void>;

  /** Create a new conversation session. */
  createSession(): Promise<AgentSessionHandle>;

  /** Send a prompt and wait for the complete response. */
  run(prompt: string, session: AgentSessionHandle): Promise<string>;

  /** Clean up resources. */
  dispose(): Promise<void>;
}

export async function createAgentBackend(type: AgentBackendType): Promise<IAgentBackend> {
  switch (type) {
    case "copilot": {
      const { CopilotBackend } = await import("./copilot-backend");
      return new CopilotBackend();
    }
    case "claude": {
      const { ClaudeBackend } = await import("./claude-backend");
      return new ClaudeBackend();
    }
    case "codex": {
      const { CodexBackend } = await import("./codex-backend");
      return new CodexBackend();
    }
    default:
      throw new Error(`Unknown agent backend type: ${type}`);
  }
}

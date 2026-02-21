import type { IAgentBackend, AgentConfig, AgentSessionHandle } from "./agent-backend";

/**
 * GitHub Copilot SDK backend implementation.
 * Uses @github/copilot-sdk's CopilotClient for agent operations.
 */
export class CopilotBackend implements IAgentBackend {
  private client: any = null;
  private session: any = null;
  private config: AgentConfig | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.config = config;

    const { CopilotClient } = await import("@github/copilot-sdk");
    this.client = new CopilotClient();
    await this.client.start();
  }

  async createSession(): Promise<AgentSessionHandle> {
    if (!this.client || !this.config) {
      throw new Error("Backend not initialized. Call initialize() first.");
    }

    // Build MCP server config for Copilot SDK format
    const mcpServers: Record<string, any> = {};
    for (const [name, server] of Object.entries(this.config.mcpServers)) {
      mcpServers[name] = {
        type: server.type === "stdio" ? "local" : server.type,
        command: server.command,
        args: server.args,
        url: server.url,
        env: server.env,
        tools: server.tools ?? ["*"],
        timeout: server.timeout,
      };
    }

    const sessionConfig: any = {
      mcpServers,
      workingDirectory: this.config.workspacePath,
    };

    if (this.config.autoApprove) {
      sessionConfig.onPermissionRequest = async () => ({ approved: true });
    } else {
      sessionConfig.onPermissionRequest = async (request: any) => {
        console.log(`\n[Permission Request: ${request.kind}]`);
        // In non-interactive mode, deny by default
        // The orchestrator handles interactive permission via channels
        return { approved: false };
      };
    }

    this.session = await this.client.createSession(sessionConfig);

    return { id: this.session.sessionId ?? "copilot-session" };
  }

  async run(prompt: string, _session: AgentSessionHandle): Promise<string> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const response = await this.session.sendAndWait({ prompt });
    return response?.data?.content ?? "";
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.destroy().catch(() => {});
      this.session = null;
    }
    if (this.client) {
      await this.client.stop().catch(() => {});
      this.client = null;
    }
  }
}

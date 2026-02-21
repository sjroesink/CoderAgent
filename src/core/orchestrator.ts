import * as fs from "fs";
import * as path from "path";
import type { MultiChannel } from "./channels/multi-channel";
import type { StatusSummarizer } from "./services/status-summarizer";
import { DevContainerHelper } from "./devcontainer-helper";
import { GitHelper } from "./git-helper";
import {
  type AgentBackendType,
  type IAgentBackend,
  type AgentSessionHandle,
  createAgentBackend,
} from "./agents/agent-backend";

/**
 * Orchestrates the agent lifecycle: initialization, task execution,
 * interactive human-in-the-loop session, and cleanup.
 */
export class AgentOrchestrator {
  private multiChannel: MultiChannel;
  private workspacePath: string;
  private sessionId: string;
  private autoApprove: boolean;
  private backendType: AgentBackendType;
  private statusSummarizer?: StatusSummarizer;
  private devContainer: DevContainerHelper;
  private backend: IAgentBackend | null = null;
  private session: AgentSessionHandle | null = null;
  private instructions = "";
  private disposed = false;

  constructor(
    multiChannel: MultiChannel,
    workspacePath: string,
    sessionId: string,
    autoApprove: boolean,
    backendType: AgentBackendType,
    statusSummarizer?: StatusSummarizer,
  ) {
    this.multiChannel = multiChannel;
    this.workspacePath = workspacePath;
    this.sessionId = sessionId;
    this.autoApprove = autoApprove;
    this.backendType = backendType;
    this.statusSummarizer = statusSummarizer;
    this.devContainer = new DevContainerHelper(workspacePath);
  }

  /** Initializes the agent backend with devcontainer-aware MCP server and permissions. */
  async initialize(): Promise<void> {
    await this.multiChannel.sendStatus("Checking devcontainer configuration...");

    if (!this.devContainer.hasDevContainerConfig()) {
      await this.multiChannel.sendStatus(
        "Warning: No devcontainer.json found. The agent will run without container isolation.",
      );
    } else {
      await this.multiChannel.sendStatus("Starting devcontainer (this may take a few minutes on first run)...");
      await this.devContainer.up();
    }

    await this.multiChannel.sendStatus(`Initializing ${this.backendType} agent...`);

    this.backend = await createAgentBackend(this.backendType);
    this.instructions = this.buildInstructions();

    await this.backend.initialize({
      workspacePath: this.workspacePath,
      autoApprove: this.autoApprove,
      mcpServers: {
        filesystem: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", this.workspacePath],
          tools: ["*"],
        },
      },
      agentId: "agent-coder",
      agentName: "Agent Coder",
      agentDescription: "An AI agent that performs coding tasks on a codebase.",
    });

    this.session = await this.backend.createSession();

    await this.multiChannel.sendStatus("Agent initialized and ready.");
  }

  /** Sends the initial task to the agent and returns its response. */
  async sendTask(task: string): Promise<string> {
    this.ensureInitialized();

    const dirName = path.basename(this.workspacePath);
    const prompt = `${this.instructions}

You are working on a codebase located at ${this.workspacePath}.
Inside the devcontainer, the workspace is mapped to /workspaces/${dirName}.

Your task:
${task}

Instructions:
1. Analyze the codebase structure and understand the relevant parts.
2. Make the necessary code changes to accomplish the task.
3. Follow existing coding conventions and patterns in the codebase.
4. After making changes, run relevant tests to verify your work.
5. Stage and commit your changes with a descriptive commit message.
6. Summarize what you did and what was changed.`;

    const response = await this.backend!.run(prompt, this.session!);
    await this.multiChannel.sendMessage("Agent", response);
    return response;
  }

  /**
   * Runs the interactive human-in-the-loop session.
   * Returns when the human issues a "stop" command.
   */
  async runInteractiveSession(): Promise<void> {
    this.ensureInitialized();

    await this.multiChannel.sendStatus(
      "Interactive session started. Commands: status, stop, steer <msg>, queue <msg>, flush, feedback <msg>, or type freely to chat.",
    );

    const messageQueue: string[] = [];

    while (true) {
      const tagged = await this.multiChannel.receiveTaggedMessage();
      if (!tagged) continue;

      const { channelType: sourceChannel, message: input } = tagged;
      if (!input?.trim()) continue;

      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "stop") {
        await this.multiChannel.sendStatus("Stopping agent. Goodbye.");
        break;
      }

      if (trimmed.toLowerCase() === "status") {
        await this.handleStatusRequest(sourceChannel);
        continue;
      }

      if (trimmed.toLowerCase().startsWith("steer ")) {
        const steerMsg = trimmed.substring(6).trim();
        await this.multiChannel.sendStatus(`Steering agent: ${steerMsg}`);
        const response = await this.backend!.run(
          `IMPORTANT COURSE CORRECTION: The human operator wants you to change direction. New instruction: ${steerMsg}`,
          this.session!,
        );
        await this.multiChannel.sendMessage("Agent", response);
        continue;
      }

      if (trimmed.toLowerCase().startsWith("queue ")) {
        const queueMsg = trimmed.substring(6).trim();
        messageQueue.push(queueMsg);
        await this.multiChannel.sendStatus(
          `Message queued (${messageQueue.length} in queue): ${queueMsg}`,
        );
        continue;
      }

      if (trimmed.toLowerCase() === "flush") {
        if (messageQueue.length === 0) {
          await this.multiChannel.sendStatus("No messages in queue.");
          continue;
        }

        const count = messageQueue.length;
        const allQueued = messageQueue.join("\n- ");
        messageQueue.length = 0;
        await this.multiChannel.sendStatus(`Flushing ${count} queued messages to agent...`);
        const response = await this.backend!.run(
          `The human operator has the following queued messages for you:\n- ${allQueued}`,
          this.session!,
        );
        await this.multiChannel.sendMessage("Agent", response);
        continue;
      }

      if (trimmed.toLowerCase().startsWith("feedback ")) {
        const feedbackMsg = trimmed.substring(9).trim();
        await this.multiChannel.sendStatus(`Sending feedback: ${feedbackMsg}`);
        const response = await this.backend!.run(
          `HUMAN FEEDBACK: ${feedbackMsg}\nPlease acknowledge and adjust your approach accordingly.`,
          this.session!,
        );
        await this.multiChannel.sendMessage("Agent", response);
        continue;
      }

      // Default: free-form chat
      const response = await this.backend!.run(trimmed, this.session!);
      await this.multiChannel.sendMessage("Agent", response);
    }
  }

  /** Asks the agent to create a pull request summary, then creates the PR. */
  async createPullRequest(branch: string, taskDescription: string): Promise<string | null> {
    this.ensureInitialized();

    await this.multiChannel.sendStatus("Generating pull request summary...");

    const summaryResponse = await this.backend!.run(
      `Please provide a concise pull request description summarizing:
1. What changes were made
2. Why they were made
3. Any important notes for reviewers
Format it as markdown suitable for a GitHub PR body.`,
      this.session!,
    );

    const prTitle = taskDescription.length > 72
      ? taskDescription.substring(0, 72) + "..."
      : taskDescription;

    const prUrl = await GitHelper.createPullRequest(this.workspacePath, branch, prTitle, summaryResponse);

    if (prUrl) {
      await this.multiChannel.sendCompletion(`Pull request created: ${prUrl}\n\n${summaryResponse}`);
    } else {
      await this.multiChannel.sendCompletion(`Could not create a PR automatically. Summary:\n\n${summaryResponse}`);
    }

    return prUrl;
  }

  private async handleStatusRequest(sourceChannel: string): Promise<void> {
    if (this.statusSummarizer) {
      const channelEntry = this.multiChannel.channels.find((c) => c.channelType === sourceChannel);

      await this.multiChannel.sendToChannel(sourceChannel, (ch) =>
        ch.sendStatus("Generating status summary..."),
      );

      const summary = await this.statusSummarizer.summarizeForChannel(
        this.sessionId,
        sourceChannel,
        channelEntry?.systemInstruction,
      );

      await this.multiChannel.sendToChannel(sourceChannel, (ch) =>
        ch.sendMessage("Agent", summary),
      );
    } else {
      await this.multiChannel.sendStatus("Requesting status from agent...");
      const response = await this.backend!.run(
        "Provide a brief status update on what you have done so far, what you are currently doing, and what remains.",
        this.session!,
      );
      await this.multiChannel.sendMessage("Agent", response);
    }
  }

  private buildInstructions(): string {
    const claudeMdPath = path.join(this.workspacePath, "CLAUDE.md");
    const projectContext = fs.existsSync(claudeMdPath)
      ? `\n\n## Project Context (from CLAUDE.md)\n\n${fs.readFileSync(claudeMdPath, "utf-8")}`
      : "";

    return `You are a skilled software engineer working on a codebase.
You can read and write files, execute shell commands, and use git.
Always follow existing coding conventions in the project.
When you make changes, explain what you did and why.
If you encounter errors, debug them and try to fix them.
Use the filesystem tools to explore and modify the codebase.
${projectContext}`;
  }

  private ensureInitialized(): void {
    if (!this.backend || !this.session) {
      throw new Error("Agent is not initialized. Call initialize() first.");
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.backend) {
      await this.backend.dispose();
    }
  }
}

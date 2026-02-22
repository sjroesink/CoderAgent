import { NextResponse } from "next/server";
import { getSessionManager, getStatusSummarizer, getIO, getGitHubService } from "../../../lib/server-context";
import { ChannelType } from "../../../../core/channels/channel";
import { MultiChannel } from "../../../../core/channels/multi-channel";
import { PersistingChannel } from "../../../../core/channels/persisting-channel";
import { WebUIChannel } from "../../../../core/channels/webui-channel";
import { GitHubPrChannel } from "../../../../core/channels/github-pr-channel";
import { createChannelFromGlobalConfig } from "../../../../core/channels/channel-factory";
import { SocketIOWebUIBridge } from "../../../lib/webui-bridge";
import type { AgentBackendType } from "../../../../core/agents/agent-backend";

export async function GET() {
  const sessionManager = getSessionManager();
  const allSessions = await sessionManager.getAllSessions();
  return NextResponse.json(allSessions);
}

export async function POST(request: Request) {
  const body = await request.json();
  const sessionManager = getSessionManager();
  const statusSummarizer = getStatusSummarizer();
  const io = getIO();

  let repoPath = body.repoPath ?? "";
  let branch = body.branch;
  let prUrl: string | undefined;
  const githubRepo: string | undefined = body.githubRepo;
  const baseBranch: string | undefined = body.baseBranch;

  // If a GitHub repo is provided, set up the worktree and draft PR
  if (githubRepo && baseBranch) {
    const github = getGitHubService();

    // Generate a session ID early so we can use it for the branch name
    const preSessionId = crypto.randomUUID();

    try {
      const setup = await github.setupSessionWorktree(githubRepo, baseBranch, preSessionId);
      repoPath = setup.worktreePath;
      branch = setup.branchName;

      // Create a draft PR
      const taskTitle = (body.task ?? "CoderAgent session").substring(0, 72);
      const draftPrUrl = await github.createDraftPr(
        setup.worktreePath,
        githubRepo,
        setup.branchName,
        baseBranch,
        taskTitle,
        `Draft PR created by CoderAgent.\n\n**Task:** ${body.task ?? "N/A"}\n\n---\n_This PR was auto-created and will be updated as the agent works._`,
      );
      prUrl = draftPrUrl ?? undefined;
    } catch (err: any) {
      return NextResponse.json(
        { error: `GitHub setup failed: ${err.message}` },
        { status: 500 },
      );
    }

    // Create session with the pre-generated ID
    const sessionId = await sessionManager.createSession({
      task: body.task,
      repoPath,
      branch,
      autoApprove: body.autoApprove ?? false,
      noPr: body.noPr ?? false,
      backendType: (body.backendType ?? "copilot") as AgentBackendType,
      channels: body.channels ?? [],
      githubRepo,
      baseBranch,
    });

    // Store the draft PR URL if created
    if (prUrl) {
      await sessionManager.updatePrUrl(sessionId, prUrl);
    }

    // Build multi-channel
    const multiChannel = new MultiChannel();

    // Add WebUI channel
    if (io) {
      const bridge = new SocketIOWebUIBridge(io, sessionId);
      const webUiChannel = new WebUIChannel(bridge);
      const persistingWebUi = new PersistingChannel(
        webUiChannel,
        sessionId,
        ChannelType.WebUI,
        sessionManager.persistMessage.bind(sessionManager),
      );
      multiChannel.addChannel(persistingWebUi, ChannelType.WebUI);
    }

    // Add GitHub PR channel if a draft PR was created
    if (prUrl) {
      try {
        // Set env vars for the GitHubPrChannel
        process.env.GITHUB_PR_URL = prUrl;
        const ghPrChannel = new GitHubPrChannel();
        const persistingGhPr = new PersistingChannel(
          ghPrChannel,
          sessionId,
          ChannelType.GitHubPR,
          sessionManager.persistMessage.bind(sessionManager),
        );
        multiChannel.addChannel(persistingGhPr, ChannelType.GitHubPR);
      } catch (err: any) {
        console.error(`Failed to create GitHub PR channel: ${err.message}`);
      }
    }

    // Add global channels
    if (body.globalChannels) {
      for (const gc of body.globalChannels) {
        try {
          const channel = createChannelFromGlobalConfig(gc.channelType as ChannelType, gc.configurationJson);
          const persisting = new PersistingChannel(
            channel,
            sessionId,
            gc.channelType,
            sessionManager.persistMessage.bind(sessionManager),
          );
          multiChannel.addChannel(persisting, gc.channelType, gc.systemInstruction);
        } catch (err: any) {
          console.error(`Failed to create channel ${gc.channelType}: ${err.message}`);
        }
      }
    }

    // Start session
    await sessionManager.startSession(sessionId, multiChannel, statusSummarizer);

    return NextResponse.json({ sessionId, prUrl }, { status: 201 });
  }

  // Standard (non-GitHub) session creation flow
  const sessionId = await sessionManager.createSession({
    task: body.task,
    repoPath: body.repoPath,
    branch: body.branch,
    autoApprove: body.autoApprove ?? false,
    noPr: body.noPr ?? false,
    backendType: (body.backendType ?? "copilot") as AgentBackendType,
    channels: body.channels ?? [],
  });

  // Build multi-channel
  const multiChannel = new MultiChannel();

  // Add WebUI channel
  if (io) {
    const bridge = new SocketIOWebUIBridge(io, sessionId);
    const webUiChannel = new WebUIChannel(bridge);
    const persistingWebUi = new PersistingChannel(
      webUiChannel,
      sessionId,
      ChannelType.WebUI,
      sessionManager.persistMessage.bind(sessionManager),
    );
    multiChannel.addChannel(persistingWebUi, ChannelType.WebUI);
  }

  // Add global channels
  if (body.globalChannels) {
    for (const gc of body.globalChannels) {
      try {
        const channel = createChannelFromGlobalConfig(gc.channelType as ChannelType, gc.configurationJson);
        const persisting = new PersistingChannel(
          channel,
          sessionId,
          gc.channelType,
          sessionManager.persistMessage.bind(sessionManager),
          false, // Don't persist outgoing broadcasts; only the WebUI channel persists those
        );
        multiChannel.addChannel(persisting, gc.channelType, gc.systemInstruction);

        // Persist the global channel in sessionChannels so it shows in the UI
        await sessionManager.addSessionChannel(sessionId, gc.channelType as ChannelType);
      } catch (err: any) {
        console.error(`Failed to create channel ${gc.channelType}: ${err.message}`);
      }
    }
  }

  // Start session
  await sessionManager.startSession(sessionId, multiChannel, statusSummarizer);

  return NextResponse.json({ sessionId }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getSessionManager, getStatusSummarizer, getIO } from "../../../lib/server-context";
import { ChannelType } from "../../../../core/channels/channel";
import { MultiChannel } from "../../../../core/channels/multi-channel";
import { PersistingChannel } from "../../../../core/channels/persisting-channel";
import { WebUIChannel } from "../../../../core/channels/webui-channel";
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
        );
        multiChannel.addChannel(persisting, gc.channelType, gc.systemInstruction);
      } catch (err: any) {
        console.error(`Failed to create channel ${gc.channelType}: ${err.message}`);
      }
    }
  }

  // Start session
  await sessionManager.startSession(sessionId, multiChannel, statusSummarizer);

  return NextResponse.json({ sessionId }, { status: 201 });
}

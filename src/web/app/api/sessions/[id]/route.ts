import { NextResponse } from "next/server";
import { getSessionManager, getStatusSummarizer, getIO } from "../../../../lib/server-context";
import { ChannelType } from "../../../../../core/channels/channel";
import { MultiChannel } from "../../../../../core/channels/multi-channel";
import { PersistingChannel } from "../../../../../core/channels/persisting-channel";
import { WebUIChannel } from "../../../../../core/channels/webui-channel";
import { SocketIOWebUIBridge } from "../../../../lib/webui-bridge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionManager = getSessionManager();
  const session = await sessionManager.getSessionEntity(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const channels = await sessionManager.getSessionChannels(id);

  return NextResponse.json({
    ...session,
    channels,
    isActive: sessionManager.isSessionActive(id),
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionManager = getSessionManager();
  const statusSummarizer = getStatusSummarizer();
  const io = getIO();

  const session = await sessionManager.getSessionEntity(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (sessionManager.isSessionActive(id)) {
    return NextResponse.json({ error: "Session is already running" }, { status: 400 });
  }

  // Rebuild multi-channel
  const multiChannel = new MultiChannel();

  if (io) {
    const bridge = new SocketIOWebUIBridge(io, id);
    const webUiChannel = new WebUIChannel(bridge);
    const persistingWebUi = new PersistingChannel(
      webUiChannel,
      id,
      ChannelType.WebUI,
      sessionManager.persistMessage.bind(sessionManager),
    );
    multiChannel.addChannel(persistingWebUi, ChannelType.WebUI);
  }

  // Restart session
  await sessionManager.startSession(id, multiChannel, statusSummarizer);

  return NextResponse.json({ ok: true });
}

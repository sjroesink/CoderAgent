import { NextResponse } from "next/server";
import { getSessionManager } from "../../../../lib/server-context";

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

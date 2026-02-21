import { NextResponse } from "next/server";
import { getSessionManager } from "../../../../../lib/server-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionManager = getSessionManager();
  const msgs = await sessionManager.getSessionMessages(id);
  return NextResponse.json(msgs);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const sessionManager = getSessionManager();

  sessionManager.sendUserMessage(id, body.message);

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getGlobalChannelService } from "../../../lib/server-context";

export async function GET() {
  const service = getGlobalChannelService();
  const channels = await service.getAll();
  return NextResponse.json(channels);
}

export async function POST(request: Request) {
  const body = await request.json();
  const service = getGlobalChannelService();

  const channel = await service.create(
    body.channelType,
    body.name,
    body.configurationJson ?? "{}",
  );

  return NextResponse.json(channel, { status: 201 });
}

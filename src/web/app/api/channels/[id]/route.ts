import { NextResponse } from "next/server";
import { getGlobalChannelService } from "../../../../lib/server-context";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const service = getGlobalChannelService();

  await service.update(
    Number(id),
    body.name,
    body.configurationJson ?? "{}",
    body.isEnabled ?? true,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const service = getGlobalChannelService();
  await service.delete(Number(id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const service = getGlobalChannelService();
  await service.toggleEnabled(Number(id));
  return NextResponse.json({ ok: true });
}

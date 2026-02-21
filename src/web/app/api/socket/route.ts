import { NextResponse } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { setIO, getIO, getSessionManager } from "../../../lib/server-context";

// Socket.IO initialization happens via a custom server setup.
// For Next.js, we use a GET handler that the custom server can hook into.
// In production, the Socket.IO server is attached to the HTTP server.

let initialized = false;

export async function GET(request: Request) {
  // This endpoint is used as a health check for the socket
  const io = getIO();
  return NextResponse.json({
    connected: !!io,
    initialized,
  });
}

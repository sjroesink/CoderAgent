/**
 * Custom server for Next.js with Socket.IO integration.
 * Run with: tsx src/web/server.ts
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO, getSessionManager } from "./lib/server-context";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "4555", 10);

const app = next({ dev, hostname, port, dir: "src/web" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: "/api/socket/io",
    addTrailingSlash: false,
  });

  setIO(io);

  // Handle Socket.IO connections
  io.on("connection", (socket) => {
    socket.on("joinSession", (sessionId: string) => {
      socket.join(sessionId);
    });

    socket.on("leaveSession", (sessionId: string) => {
      socket.leave(sessionId);
    });

    socket.on("sendMessage", ({ sessionId, message }: { sessionId: string; message: string }) => {
      const sessionManager = getSessionManager();
      sessionManager.sendUserMessage(sessionId, message);
    });
  });

  // Forward session events to Socket.IO
  const sessionManager = getSessionManager();
  sessionManager.on("sessionStatusChanged", (sessionId: string, status: string) => {
    io.to(sessionId).emit("sessionStatusChanged", { sessionId, status });
    io.emit("sessionListUpdated");
  });

  sessionManager.on("messagePersisted", (sessionId: string, channelType: string, sender: string, content: string, messageType: string) => {
    io.to(sessionId).emit("receiveMessage", {
      sender,
      message: content,
      channelType,
      messageType,
      timestamp: new Date().toISOString(),
    });
  });

  httpServer.listen(port, () => {
    console.log(`> AgentCoder Web ready on http://${hostname}:${port}`);
  });
});

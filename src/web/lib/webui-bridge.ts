import type { Server as SocketIOServer } from "socket.io";
import type { IWebUIBridge } from "../../core/channels/webui-channel";

/**
 * Socket.IO-backed implementation of IWebUIBridge.
 * Pushes messages to connected clients in the session room.
 */
export class SocketIOWebUIBridge implements IWebUIBridge {
  private io: SocketIOServer;
  readonly sessionId: string;

  constructor(io: SocketIOServer, sessionId: string) {
    this.io = io;
    this.sessionId = sessionId;
  }

  async pushMessage(sender: string, message: string, messageType: string): Promise<void> {
    this.io.to(this.sessionId).emit("receiveMessage", {
      sender,
      message,
      messageType,
      timestamp: new Date().toISOString(),
    });
  }

  async pushSessionUpdated(newStatus: string): Promise<void> {
    this.io.to(this.sessionId).emit("sessionStatusChanged", {
      sessionId: this.sessionId,
      status: newStatus,
    });
    this.io.emit("sessionListUpdated");
  }
}

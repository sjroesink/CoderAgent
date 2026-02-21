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

  async pushMessage(_sender: string, _message: string, _messageType: string): Promise<void> {
    // No-op: messages are pushed to the client via the messagePersisted event
    // in server.ts, which includes channelType. This avoids duplicate messages.
  }

  async pushSessionUpdated(newStatus: string): Promise<void> {
    this.io.to(this.sessionId).emit("sessionStatusChanged", {
      sessionId: this.sessionId,
      status: newStatus,
    });
    this.io.emit("sessionListUpdated");
  }
}

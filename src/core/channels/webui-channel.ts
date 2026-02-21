import type { IChannel } from "./channel";

/**
 * Abstraction so WebUIChannel does not depend on Socket.IO directly.
 * Implemented in the web layer using Socket.IO server.
 */
export interface IWebUIBridge {
  sessionId: string;
  pushMessage(sender: string, message: string, messageType: string): Promise<void>;
  pushSessionUpdated(newStatus: string): Promise<void>;
}

/**
 * Bridge between the web UI (via Socket.IO) and the agent orchestrator.
 * Outgoing messages are pushed via IWebUIBridge.
 * Incoming messages come from the UI via an internal buffer.
 */
export class WebUIChannel implements IChannel {
  private bridge: IWebUIBridge;
  private incoming: string[] = [];
  private waitingResolve: ((value: string) => void) | null = null;

  constructor(bridge: IWebUIBridge) {
    this.bridge = bridge;
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.bridge.pushMessage(sender, message, "Message");
  }

  async sendStatus(status: string): Promise<void> {
    await this.bridge.pushMessage("System", status, "Status");
  }

  async receiveMessage(): Promise<string | null> {
    if (this.incoming.length > 0) {
      return this.incoming.shift()!;
    }
    return new Promise<string>((resolve) => {
      this.waitingResolve = resolve;
    });
  }

  async sendCompletion(summary: string): Promise<void> {
    await this.bridge.pushMessage("System", summary, "Completion");
  }

  /** Called by the web UI when the user types a message. */
  enqueueUserMessage(message: string): void {
    if (this.waitingResolve) {
      this.waitingResolve(message);
      this.waitingResolve = null;
    } else {
      this.incoming.push(message);
    }
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }
}

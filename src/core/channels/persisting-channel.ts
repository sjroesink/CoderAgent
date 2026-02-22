import type { IChannel } from "./channel";

export type PersistFunc = (
  sessionId: string,
  channelType: string,
  sender: string,
  content: string,
  messageType: string,
) => Promise<void>;

/**
 * Decorator that wraps an IChannel and persists every
 * sent/received message to the database via a callback.
 *
 * When `persistOutgoing` is false, only incoming (received) messages
 * are persisted.  This prevents duplicate DB rows when multiple
 * channels are attached to a MultiChannel – only the primary (WebUI)
 * channel should persist outgoing broadcasts.
 */
export class PersistingChannel implements IChannel {
  private inner: IChannel;
  private sessionId: string;
  private channelType: string;
  private persistFunc: PersistFunc;
  private persistOutgoing: boolean;

  constructor(
    inner: IChannel,
    sessionId: string,
    channelType: string,
    persistFunc: PersistFunc,
    persistOutgoing = true,
  ) {
    this.inner = inner;
    this.sessionId = sessionId;
    this.channelType = channelType;
    this.persistFunc = persistFunc;
    this.persistOutgoing = persistOutgoing;
  }

  get innerChannel(): IChannel {
    return this.inner;
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    if (this.persistOutgoing) {
      await this.persistFunc(this.sessionId, this.channelType, sender, message, "Message");
    }
    await this.inner.sendMessage(sender, message);
  }

  async sendStatus(status: string): Promise<void> {
    if (this.persistOutgoing) {
      await this.persistFunc(this.sessionId, this.channelType, "System", status, "Status");
    }
    await this.inner.sendStatus(status);
  }

  async receiveMessage(): Promise<string | null> {
    const msg = await this.inner.receiveMessage();
    if (msg !== null) {
      await this.persistFunc(this.sessionId, this.channelType, "User", msg, "Message");
    }
    return msg;
  }

  async sendCompletion(summary: string): Promise<void> {
    if (this.persistOutgoing) {
      await this.persistFunc(this.sessionId, this.channelType, "System", summary, "Completion");
    }
    await this.inner.sendCompletion(summary);
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }
}

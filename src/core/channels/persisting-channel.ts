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
 */
export class PersistingChannel implements IChannel {
  private inner: IChannel;
  private sessionId: string;
  private channelType: string;
  private persistFunc: PersistFunc;

  constructor(
    inner: IChannel,
    sessionId: string,
    channelType: string,
    persistFunc: PersistFunc,
  ) {
    this.inner = inner;
    this.sessionId = sessionId;
    this.channelType = channelType;
    this.persistFunc = persistFunc;
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.persistFunc(this.sessionId, this.channelType, sender, message, "Message");
    await this.inner.sendMessage(sender, message);
  }

  async sendStatus(status: string): Promise<void> {
    await this.persistFunc(this.sessionId, this.channelType, "System", status, "Status");
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
    await this.persistFunc(this.sessionId, this.channelType, "System", summary, "Completion");
    await this.inner.sendCompletion(summary);
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }
}

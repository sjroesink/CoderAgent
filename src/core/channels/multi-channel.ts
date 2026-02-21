import type { IChannel, TaggedMessage, ChannelEntry } from "./channel";
import { WebUIChannel } from "./webui-channel";

/**
 * Composite channel that broadcasts outgoing messages to all attached channels
 * and merges incoming messages from all channels into a single stream.
 */
export class MultiChannel implements IChannel {
  private _channels: ChannelEntry[] = [];
  private incomingQueue: TaggedMessage[] = [];
  private waitingResolve: ((value: TaggedMessage) => void) | null = null;
  private listenerAbortControllers: AbortController[] = [];

  get channels(): ReadonlyArray<ChannelEntry> {
    return this._channels;
  }

  addChannel(channel: IChannel, channelType: string, systemInstruction?: string): void {
    const entry: ChannelEntry = { channel, channelType, systemInstruction };
    this._channels.push(entry);

    // Start a listener task that reads from this channel and writes to the merged queue
    const ac = new AbortController();
    this.listenerAbortControllers.push(ac);
    this.listenToChannel(channel, channelType, ac.signal);
  }

  /** Gets the WebUI channel if one is attached. */
  getWebUIChannel(): WebUIChannel | undefined {
    const entry = this._channels.find((c) => c.channelType === "WebUI");
    if (!entry) return undefined;

    // Unwrap PersistingChannel if needed
    let channel = entry.channel;
    if ('innerChannel' in channel) {
      channel = (channel as any).innerChannel;
    }

    return channel instanceof WebUIChannel ? channel : undefined;
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.broadcast((ch) => ch.sendMessage(sender, message));
  }

  async sendStatus(status: string): Promise<void> {
    await this.broadcast((ch) => ch.sendStatus(status));
  }

  async receiveMessage(): Promise<string | null> {
    const tagged = await this.receiveTaggedMessage();
    return tagged?.message ?? null;
  }

  /** Receives a message tagged with its source channel type. */
  async receiveTaggedMessage(): Promise<TaggedMessage | null> {
    if (this.incomingQueue.length > 0) {
      return this.incomingQueue.shift()!;
    }
    return new Promise<TaggedMessage>((resolve) => {
      this.waitingResolve = resolve;
    });
  }

  async sendCompletion(summary: string): Promise<void> {
    await this.broadcast((ch) => ch.sendCompletion(summary));
  }

  /** Sends a message to a specific channel only (used for targeted status responses). */
  async sendToChannel(channelType: string, action: (ch: IChannel) => Promise<void>): Promise<void> {
    const entry = this._channels.find((c) => c.channelType === channelType);
    if (entry) {
      await action(entry.channel);
    }
  }

  private async broadcast(action: (ch: IChannel) => Promise<void>): Promise<void> {
    const tasks = this._channels.map((c) => {
      try {
        return action(c.channel);
      } catch {
        return Promise.resolve();
      }
    });
    await Promise.all(tasks);
  }

  private async listenToChannel(channel: IChannel, channelType: string, signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        const msg = await channel.receiveMessage();
        if (msg !== null) {
          const tagged: TaggedMessage = { channelType, message: msg };
          if (this.waitingResolve) {
            this.waitingResolve(tagged);
            this.waitingResolve = null;
          } else {
            this.incomingQueue.push(tagged);
          }
        }
      }
    } catch (err: any) {
      if (!signal.aborted) {
        console.error(`[MultiChannel] Listener for ${channelType} stopped: ${err.message}`);
      }
    }
  }

  async dispose(): Promise<void> {
    for (const ac of this.listenerAbortControllers) {
      ac.abort();
    }
    for (const entry of this._channels) {
      await entry.channel.dispose();
    }
  }
}

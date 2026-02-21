export enum ChannelType {
  Console = "Console",
  Jira = "Jira",
  Teams = "Teams",
  GitHubPR = "GitHubPR",
  Telegram = "Telegram",
  WebUI = "WebUI",
}

/**
 * Abstraction for bidirectional communication with a human operator.
 */
export interface IChannel {
  /** Send a message from the agent to the human. */
  sendMessage(sender: string, message: string): Promise<void>;

  /** Send a status update (e.g. "Agent is working on task X"). */
  sendStatus(status: string): Promise<void>;

  /** Wait for the next human input. Returns null when the channel is closed. */
  receiveMessage(): Promise<string | null>;

  /** Post a notification that the agent has completed its task. */
  sendCompletion(summary: string): Promise<void>;

  /** Clean up resources. */
  dispose(): Promise<void>;
}

export interface TaggedMessage {
  channelType: string;
  message: string;
}

export interface ChannelEntry {
  channel: IChannel;
  channelType: string;
  systemInstruction?: string;
}

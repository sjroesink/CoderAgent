import { ChannelType, type IChannel } from "./channel";
import { ConsoleChannel } from "./console-channel";
import { JiraChannel } from "./jira-channel";
import { TeamsChannel } from "./teams-channel";
import { GitHubPrChannel } from "./github-pr-channel";
import { TelegramChannel, type TelegramChannelOptions } from "./telegram-channel";
import { WebUIChannel, type IWebUIBridge } from "./webui-channel";

export function createChannel(type: ChannelType, options?: unknown): IChannel {
  switch (type) {
    case ChannelType.Console:
      return new ConsoleChannel();
    case ChannelType.Jira:
      return new JiraChannel();
    case ChannelType.Teams:
      return new TeamsChannel();
    case ChannelType.GitHubPR:
      return new GitHubPrChannel();
    case ChannelType.Telegram:
      return options
        ? new TelegramChannel(options as TelegramChannelOptions)
        : new TelegramChannel();
    case ChannelType.WebUI:
      if (!options) throw new Error("IWebUIBridge is required for WebUI channel.");
      return new WebUIChannel(options as IWebUIBridge);
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}

/**
 * Creates a channel from a global channel configuration JSON blob stored in the database.
 */
export function createChannelFromGlobalConfig(type: ChannelType, configurationJson: string): IChannel {
  const config = JSON.parse(configurationJson);

  switch (type) {
    case ChannelType.Telegram:
      return new TelegramChannel({
        botToken: config.botToken,
        chatId: Number(config.chatId),
      });
    case ChannelType.Teams:
      return new TeamsChannel(config.webhookUrl);
    default:
      throw new Error(`Channel type ${type} does not support global configuration.`);
  }
}

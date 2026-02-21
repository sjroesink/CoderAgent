import { ChannelType } from "./channel";

export interface ChannelConfigField {
  key: string;
  label: string;
  inputType: string;
  required: boolean;
  placeholder: string;
}

/** Channel types that can be configured as global channels in the database. */
export const GLOBAL_CHANNEL_TYPES: ChannelType[] = [
  ChannelType.Telegram,
  ChannelType.Teams,
];

/** Channel types initialized per-session (require session-specific context). */
export const AGENT_INITIALIZED_CHANNEL_TYPES: ChannelType[] = [
  ChannelType.Jira,
  ChannelType.GitHubPR,
];

/** Returns the configuration fields needed for a given channel type. */
export function getConfigFields(type: ChannelType): ChannelConfigField[] {
  switch (type) {
    case ChannelType.Telegram:
      return [
        { key: "botToken", label: "Bot Token", inputType: "text", required: true, placeholder: "Token from @BotFather" },
        { key: "chatId", label: "Chat ID", inputType: "text", required: true, placeholder: "Numeric chat ID" },
      ];
    case ChannelType.Teams:
      return [
        { key: "webhookUrl", label: "Webhook URL", inputType: "url", required: true, placeholder: "Incoming Webhook URL" },
      ];
    default:
      return [];
  }
}

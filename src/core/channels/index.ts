export { ChannelType, type IChannel, type TaggedMessage, type ChannelEntry } from "./channel";
export { ConsoleChannel } from "./console-channel";
export { TelegramChannel, type TelegramChannelOptions } from "./telegram-channel";
export { TeamsChannel } from "./teams-channel";
export { JiraChannel } from "./jira-channel";
export { GitHubPrChannel } from "./github-pr-channel";
export { WebUIChannel, type IWebUIBridge } from "./webui-channel";
export { MultiChannel } from "./multi-channel";
export { PersistingChannel, type PersistFunc } from "./persisting-channel";
export { createChannel, createChannelFromGlobalConfig } from "./channel-factory";
export {
  type ChannelConfigField,
  GLOBAL_CHANNEL_TYPES,
  AGENT_INITIALIZED_CHANNEL_TYPES,
  getConfigFields,
} from "./channel-metadata";

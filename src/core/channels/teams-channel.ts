import type { IChannel } from "./channel";
import { ConsoleChannel } from "./console-channel";

/**
 * Microsoft Teams channel that posts agent updates via an Incoming Webhook.
 * Human input comes from the console fallback.
 */
export class TeamsChannel implements IChannel {
  private webhookUrl: string;
  private fallback = new ConsoleChannel();

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl ?? process.env.TEAMS_WEBHOOK_URL ?? "";
    if (!this.webhookUrl) {
      throw new Error("TEAMS_WEBHOOK_URL is required.");
    }
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.fallback.sendMessage(sender, message);
    await this.postCard(`**[${sender}]** ${message}`);
  }

  async sendStatus(status: string): Promise<void> {
    await this.fallback.sendStatus(status);
    await this.postCard(`_Status:_ ${status}`);
  }

  async receiveMessage(): Promise<string | null> {
    return this.fallback.receiveMessage();
  }

  async sendCompletion(summary: string): Promise<void> {
    await this.fallback.sendCompletion(summary);
    await this.postCard(`**Task Complete**\n\n${summary}`);
  }

  private async postCard(text: string): Promise<void> {
    const payload = JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [{ type: "TextBlock", text, wrap: true }],
          },
        },
      ],
    });

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        console.error(`[Teams] Failed to post message: ${response.status}`);
      }
    } catch (err: any) {
      console.error(`[Teams] Error posting message: ${err.message}`);
    }
  }

  async dispose(): Promise<void> {
    await this.fallback.dispose();
  }
}

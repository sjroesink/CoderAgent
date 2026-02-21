import type { IChannel } from "./channel";
import { ConsoleChannel } from "./console-channel";

/**
 * Jira channel that posts agent updates as comments on a Jira issue.
 * Requires: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_ISSUE_KEY
 */
export class JiraChannel implements IChannel {
  private baseUrl: string;
  private issueKey: string;
  private authHeader: string;
  private fallback = new ConsoleChannel();

  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL ?? "";
    this.issueKey = process.env.JIRA_ISSUE_KEY ?? "";
    const email = process.env.JIRA_EMAIL ?? "";
    const token = process.env.JIRA_API_TOKEN ?? "";

    if (!this.baseUrl) throw new Error("JIRA_BASE_URL environment variable is required.");
    if (!this.issueKey) throw new Error("JIRA_ISSUE_KEY environment variable is required.");
    if (!email) throw new Error("JIRA_EMAIL environment variable is required.");
    if (!token) throw new Error("JIRA_API_TOKEN environment variable is required.");

    this.authHeader = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.fallback.sendMessage(sender, message);
    await this.postComment(`*[${sender}]*\n${message}`);
  }

  async sendStatus(status: string): Promise<void> {
    await this.fallback.sendStatus(status);
    await this.postComment(`_Status: ${status}_`);
  }

  async receiveMessage(): Promise<string | null> {
    return this.fallback.receiveMessage();
  }

  async sendCompletion(summary: string): Promise<void> {
    await this.fallback.sendCompletion(summary);
    await this.postComment(`*Task Complete*\n${summary}`);
  }

  private async postComment(body: string): Promise<void> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/rest/api/3/issue/${this.issueKey}/comment`;
    const payload = JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: body }],
          },
        ],
      },
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
          Accept: "application/json",
        },
        body: payload,
      });
      if (!response.ok) {
        console.error(`[Jira] Failed to post comment: ${response.status}`);
      }
    } catch (err: any) {
      console.error(`[Jira] Error posting comment: ${err.message}`);
    }
  }

  async dispose(): Promise<void> {
    await this.fallback.dispose();
  }
}

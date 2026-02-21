import { execa } from "execa";
import type { IChannel } from "./channel";
import { ConsoleChannel } from "./console-channel";

/**
 * GitHub Pull Request channel that posts agent updates as PR comments
 * using the GitHub CLI (gh).
 * Requires: gh CLI installed + GITHUB_PR_URL or GITHUB_REPO + GITHUB_PR_NUMBER
 */
export class GitHubPrChannel implements IChannel {
  private repo: string;
  private prNumber: number;
  private fallback = new ConsoleChannel();

  constructor() {
    const prUrl = process.env.GITHUB_PR_URL;
    if (prUrl) {
      const url = new URL(prUrl);
      const segments = url.pathname.replace(/^\/+/, "").split("/");
      if (segments.length >= 4 && segments[2] === "pull") {
        this.repo = `${segments[0]}/${segments[1]}`;
        this.prNumber = parseInt(segments[3], 10);
      } else {
        throw new Error(`Could not parse PR URL: ${prUrl}`);
      }
    } else {
      this.repo = process.env.GITHUB_REPO ?? "";
      const prNumStr = process.env.GITHUB_PR_NUMBER ?? "";
      if (!this.repo || !prNumStr) {
        throw new Error("Set GITHUB_PR_URL or both GITHUB_REPO and GITHUB_PR_NUMBER.");
      }
      this.prNumber = parseInt(prNumStr, 10);
    }
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    await this.fallback.sendMessage(sender, message);
    await this.postPrComment(`**[${sender}]**\n${message}`);
  }

  async sendStatus(status: string): Promise<void> {
    await this.fallback.sendStatus(status);
    await this.postPrComment(`_Status: ${status}_`);
  }

  async receiveMessage(): Promise<string | null> {
    return this.fallback.receiveMessage();
  }

  async sendCompletion(summary: string): Promise<void> {
    await this.fallback.sendCompletion(summary);
    await this.postPrComment(`## Task Complete\n\n${summary}`);
  }

  private async postPrComment(body: string): Promise<void> {
    try {
      await execa("gh", [
        "pr", "comment", String(this.prNumber),
        "--repo", this.repo,
        "--body", body,
      ]);
    } catch (err: any) {
      console.error(`[GitHubPR] Error posting comment: ${err.message}`);
    }
  }

  async dispose(): Promise<void> {
    await this.fallback.dispose();
  }
}

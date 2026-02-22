import type { IChannel } from "./channel";
import { ConsoleChannel } from "./console-channel";
import type { GitHubService } from "../services/github-service";

/**
 * GitHub Pull Request channel that posts agent updates as PR comments
 * using Octokit via the shared GitHubService.
 */
export class GitHubPrChannel implements IChannel {
  private repo: string;
  private prNumber: number;
  private githubService: GitHubService;
  private fallback = new ConsoleChannel();

  constructor(githubService: GitHubService, prUrl: string) {
    this.githubService = githubService;

    const url = new URL(prUrl);
    const segments = url.pathname.replace(/^\/+/, "").split("/");
    if (segments.length >= 4 && segments[2] === "pull") {
      this.repo = `${segments[0]}/${segments[1]}`;
      this.prNumber = parseInt(segments[3], 10);
    } else {
      throw new Error(`Could not parse PR URL: ${prUrl}`);
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
      await this.githubService.postPrComment(this.repo, this.prNumber, body);
    } catch (err: any) {
      console.error(`[GitHubPR] Error posting comment: ${err.message}`);
    }
  }

  async dispose(): Promise<void> {
    await this.fallback.dispose();
  }
}

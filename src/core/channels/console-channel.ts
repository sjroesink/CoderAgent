import chalk from "chalk";
import * as readline from "readline";
import type { IChannel } from "./channel";

/**
 * Interactive console channel using stdin/stdout.
 */
export class ConsoleChannel implements IChannel {
  private rl: readline.Interface | null = null;

  async sendMessage(sender: string, message: string): Promise<void> {
    console.log();
    console.log(chalk.cyan(`[${sender}] `) + message);
  }

  async sendStatus(status: string): Promise<void> {
    console.log(chalk.yellow(`[Status] ${status}`));
  }

  async receiveMessage(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl) {
        this.rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        this.rl.on("close", () => resolve(null));
      }

      console.log();
      this.rl.question(chalk.green("[You] > "), (answer) => {
        resolve(answer ?? null);
      });
    });
  }

  async sendCompletion(summary: string): Promise<void> {
    console.log();
    console.log(chalk.magenta("========== TASK COMPLETE =========="));
    console.log(summary);
    console.log(chalk.magenta("==================================="));
  }

  async dispose(): Promise<void> {
    this.rl?.close();
    this.rl = null;
  }
}

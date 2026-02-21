import { Telegraf } from "telegraf";
import type { IChannel } from "./channel";
import {message} from "telegraf/filters";

export interface TelegramChannelOptions {
  botToken: string;
  chatId: number;
}

/**
 * Telegram channel using the Telegram Bot API for bidirectional messaging.
 */
export class TelegramChannel implements IChannel {
  private bot: Telegraf;
  private chatId: number;
  private incoming: string[] = [];
  private waitingResolve: ((value: string) => void) | null = null;

  constructor(options?: TelegramChannelOptions) {
    const botToken = options?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
    const chatId = options?.chatId ?? Number(process.env.TELEGRAM_CHAT_ID);

    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required.");
    if (!chatId || isNaN(chatId)) throw new Error("TELEGRAM_CHAT_ID is required.");

    this.chatId = chatId;
    this.bot = new Telegraf(botToken);

    // Register bot commands for discoverability in Telegram UI
    this.bot.telegram.setMyCommands([
      { command: "status", description: "Get a progress summary from the agent" },
      { command: "stop", description: "Stop the current agent session" },
      { command: "steer", description: "Send a course correction to the agent" },
      { command: "queue", description: "Add a message to the queue (send later with /flush)" },
      { command: "flush", description: "Send all queued messages to the agent" },
      { command: "feedback", description: "Send human feedback to the agent" },
    ]).catch((err) => {
      console.error(`[Telegram] Failed to set bot commands: ${err.message}`);
    });

    // Handle /command messages — translate to orchestrator command format
    for (const cmd of ["steer", "queue", "feedback"]) {
      this.bot.command(cmd, (ctx) => {
        if (ctx.chat.id !== this.chatId) return;
        const args = ctx.message.text.replace(`/${cmd}`, "").replace(`/${cmd}@${ctx.botInfo.username}`, "").trim();
        if (!args) {
          ctx.reply(`Usage: /${cmd} <message>`).catch(() => {});
          return;
        }
        this.enqueue(`${cmd} ${args}`);
      });
    }

    for (const cmd of ["status", "stop", "flush"]) {
      this.bot.command(cmd, (ctx) => {
        if (ctx.chat.id !== this.chatId) return;
        this.enqueue(cmd);
      });
    }

    this.bot.on(message("text"), (ctx) => {
      if (ctx.chat.id === this.chatId) {
        this.enqueue(ctx.message.text);
      }
    });

    this.bot.launch().catch((err) => {
      console.error(`[Telegram] Launch error: ${err.message}`);
    });
  }

  private enqueue(text: string): void {
    if (this.waitingResolve) {
      this.waitingResolve(text);
      this.waitingResolve = null;
    } else {
      this.incoming.push(text);
    }
  }

  async sendMessage(sender: string, message: string): Promise<void> {
    const text = escapeHtml(message);
    await this.sendSafe(text);
  }

  async sendStatus(status: string): Promise<void> {
    const text = `<i>Status: ${escapeHtml(status)}</i>`;
    await this.sendSafe(text);
  }

  async receiveMessage(): Promise<string | null> {
    if (this.incoming.length > 0) {
      return this.incoming.shift()!;
    }
    return new Promise<string>((resolve) => {
      this.waitingResolve = resolve;
    });
  }

  async sendCompletion(summary: string): Promise<void> {
    const text = `<b>Task Complete</b>\n\n${escapeHtml(summary)}`;
    await this.sendSafe(text);
  }

  private async sendSafe(html: string): Promise<void> {
    try {
      // Telegram has a 4096 char limit per message
      if (html.length > 4000) {
        html = html.substring(0, 4000) + "\n\n<i>(truncated)</i>";
      }
      await this.bot.telegram.sendMessage(this.chatId, html, { parse_mode: "HTML" });
    } catch (err: any) {
      console.error(`[Telegram] Error sending message: ${err.message}`);
    }
  }

  async dispose(): Promise<void> {
    this.bot.stop("dispose");
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

import { Command } from "commander";
import chalk from "chalk";
import * as path from "path";
import * as fs from "fs";
import { createDb } from "../core/data/db";
import { sessions, messages, sessionChannels, globalChannels } from "../core/data/schema";
import { sql } from "drizzle-orm";
import { ChannelType } from "../core/channels/channel";
import { ConsoleChannel } from "../core/channels/console-channel";
import { MultiChannel } from "../core/channels/multi-channel";
import { PersistingChannel } from "../core/channels/persisting-channel";
import { createChannel } from "../core/channels/channel-factory";
import { SessionManager, type ChannelRequest } from "../core/services/session-manager";
import { StatusSummarizer } from "../core/services/status-summarizer";
import { DevContainerHelper } from "../core/devcontainer-helper";
import { GitHelper } from "../core/git-helper";
import type { AgentBackendType } from "../core/agents/agent-backend";

const program = new Command();

program
  .name("agent-coder")
  .description(
    "Runs an AI agent on your codebase inside a devcontainer. " +
    "The agent performs the given task, allows human-in-the-loop interaction, " +
    "and optionally creates a pull request with the changes.",
  )
  .requiredOption(
    "-t, --task <description>",
    "Task description for the agent. Can be a short instruction like 'Fix the login bug' " +
    "or a longer description of the work to be done.",
  )
  .requiredOption(
    "-r, --repo <path>",
    "Path to the repository/workspace.",
  )
  .option(
    "-b, --branch <name>",
    "Branch name to check out in a new git worktree. " +
    "If provided, a worktree is created so the main repo stays untouched.",
  )
  .option(
    "-c, --channel <type>",
    "Communication channel: Console, Jira, Teams, GitHubPR, Telegram",
    "Console",
  )
  .option(
    "--backend <type>",
    "Agent backend: copilot or claude",
    "copilot",
  )
  .option("--no-pr", "Skip automatic pull request creation after the agent finishes.")
  .option(
    "--auto-approve",
    "Auto-approve all agent permission requests. Use with caution.",
  )
  .action(async (opts) => {
    const task: string = opts.task;
    const repo = path.resolve(opts.repo);
    const branch: string | undefined = opts.branch;
    const channelName: string = opts.channel;
    const backendType: AgentBackendType = opts.backend as AgentBackendType;
    const noPr: boolean = !opts.pr;
    const autoApprove: boolean = opts.autoApprove ?? false;

    // Validate inputs
    if (!fs.existsSync(repo)) {
      console.error(chalk.red(`Error: Repository path does not exist: ${repo}`));
      process.exit(1);
    }

    const channelType = channelName as ChannelType;
    if (!Object.values(ChannelType).includes(channelType)) {
      console.error(chalk.red(`Error: Unknown channel type: ${channelName}`));
      process.exit(1);
    }

    // Banner
    console.log(chalk.cyan(`
     █████╗  ██████╗ ███████╗███╗   ██╗████████╗
    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
               ██████╗ ██████╗ ██████╗ ███████╗██████╗
              ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗
              ██║     ██║   ██║██║  ██║█████╗  ██████╔╝
              ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗
              ╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║
               ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
    `));

    console.log(`  Repo:    ${repo}`);
    console.log(`  Branch:  ${branch ?? "(current)"}`);
    console.log(`  Channel: ${channelType}`);
    console.log(`  Backend: ${backendType}`);
    console.log(`  Task:    ${task.length > 80 ? task.substring(0, 80) + "..." : task}`);
    console.log();

    // Prerequisite checks
    if (!(await DevContainerHelper.isAvailable())) {
      console.error(chalk.red("Error: devcontainer CLI is not installed or not in PATH."));
      console.error(chalk.red("Install it with: npm install -g @devcontainers/cli"));
      process.exit(1);
    }

    // Worktree setup
    let workDir = repo;
    if (branch) {
      try {
        workDir = await GitHelper.createWorktree(repo, branch);
      } catch (err: any) {
        console.error(chalk.red(`Error creating worktree: ${err.message}`));
        process.exit(1);
      }
    }

    // Initialize database
    const db = createDb("agentcoder.db");

    // Ensure tables exist using raw SQL
    db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Created',
      repo_path TEXT NOT NULL DEFAULT '',
      branch TEXT,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      no_pr INTEGER NOT NULL DEFAULT 0,
      pr_url TEXT,
      backend_type TEXT NOT NULL DEFAULT 'copilot',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(sql`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender TEXT NOT NULL DEFAULT '',
      channel_type TEXT,
      content TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'Message',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(sql`CREATE TABLE IF NOT EXISTS session_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      channel_type TEXT NOT NULL DEFAULT '',
      system_instruction TEXT,
      last_status_request_at TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(sql`CREATE TABLE IF NOT EXISTS global_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_type TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      configuration_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    const sessionManager = new SessionManager(db);
    const statusSummarizer = new StatusSummarizer(db, backendType);

    const channels: ChannelRequest[] = [];
    if (channelType !== ChannelType.Console) {
      channels.push({ type: channelType });
    }

    const sessionId = await sessionManager.createSession({
      task,
      repoPath: workDir,
      branch,
      autoApprove,
      noPr,
      backendType,
      channels,
    });

    console.log(`  Session: ${sessionId}`);
    console.log();

    // Build multi-channel
    const multiChannel = new MultiChannel();

    // Always add Console channel
    const consoleChannel = new ConsoleChannel();
    const persistingConsole = new PersistingChannel(
      consoleChannel,
      sessionId,
      ChannelType.Console,
      sessionManager.persistMessage.bind(sessionManager),
    );
    multiChannel.addChannel(persistingConsole, ChannelType.Console);

    // Add additional channel if specified
    if (channelType !== ChannelType.Console) {
      const extraChannel = createChannel(channelType);
      const persistingExtra = new PersistingChannel(
        extraChannel,
        sessionId,
        channelType,
        sessionManager.persistMessage.bind(sessionManager),
      );
      multiChannel.addChannel(persistingExtra, channelType);
    }

    // Run agent
    try {
      await sessionManager.startSession(sessionId, multiChannel, statusSummarizer);
      await sessionManager.waitForSession(sessionId);
    } catch (err: any) {
      console.error(chalk.red(`\nFatal error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();

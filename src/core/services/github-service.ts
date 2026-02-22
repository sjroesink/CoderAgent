import { execa } from "execa";
import * as fs from "fs";
import * as path from "path";

export interface GitHubRepo {
  nameWithOwner: string;
  description: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface GitHubBranch {
  name: string;
}

/**
 * Service for interacting with GitHub via the `gh` CLI.
 * Used in Docker/cloud mode to let users select repos and branches.
 */
export class GitHubService {
  private workspacesRoot: string;

  constructor(workspacesRoot = "/data/workspaces") {
    this.workspacesRoot = workspacesRoot;
  }

  /** Check if the gh CLI is authenticated. */
  async getAuthStatus(): Promise<{ authenticated: boolean; username?: string }> {
    try {
      const result = await execa("gh", ["auth", "status"], { reject: false });
      // gh auth status outputs to stderr on success
      const output = result.stdout + result.stderr;
      if (result.exitCode === 0) {
        const match = output.match(/Logged in to github\.com.*account\s+(\S+)/i)
          ?? output.match(/account\s+(\S+)/i)
          ?? output.match(/Logged in to github\.com as (\S+)/i);
        return { authenticated: true, username: match?.[1] };
      }
      return { authenticated: false };
    } catch {
      return { authenticated: false };
    }
  }

  /** List repositories the authenticated user has access to. */
  async listRepos(limit = 50): Promise<GitHubRepo[]> {
    const result = await execa("gh", [
      "repo", "list",
      "--limit", String(limit),
      "--json", "nameWithOwner,description,url,isPrivate,defaultBranchRef",
    ], { reject: false });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list repos: ${result.stderr}`);
    }

    const raw = JSON.parse(result.stdout) as Array<{
      nameWithOwner: string;
      description: string;
      url: string;
      isPrivate: boolean;
      defaultBranchRef: { name: string } | null;
    }>;

    return raw.map((r) => ({
      nameWithOwner: r.nameWithOwner,
      description: r.description ?? "",
      url: r.url,
      isPrivate: r.isPrivate,
      defaultBranch: r.defaultBranchRef?.name ?? "main",
    }));
  }

  /** Search repositories by name. */
  async searchRepos(query: string, limit = 30): Promise<GitHubRepo[]> {
    const result = await execa("gh", [
      "search", "repos", query,
      "--limit", String(limit),
      "--owner", "@me",
      "--json", "nameWithOwner,description,url,isPrivate",
    ], { reject: false });

    // If search fails, fall back to listing and filtering
    if (result.exitCode !== 0) {
      const all = await this.listRepos(100);
      const q = query.toLowerCase();
      return all.filter((r) => r.nameWithOwner.toLowerCase().includes(q));
    }

    const raw = JSON.parse(result.stdout) as Array<{
      nameWithOwner: string;
      description: string;
      url: string;
      isPrivate: boolean;
    }>;

    return raw.map((r) => ({
      nameWithOwner: r.nameWithOwner,
      description: r.description ?? "",
      url: r.url,
      isPrivate: r.isPrivate,
      defaultBranch: "main",
    }));
  }

  /** List branches for a given repository. */
  async listBranches(repo: string, limit = 100): Promise<GitHubBranch[]> {
    const result = await execa("gh", [
      "api",
      `repos/${repo}/branches`,
      "--paginate",
      "--jq", `.[].name`,
    ], { reject: false });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list branches for ${repo}: ${result.stderr}`);
    }

    const names = result.stdout.trim().split("\n").filter(Boolean);
    return names.slice(0, limit).map((name) => ({ name }));
  }

  /** Clone a repository into the workspaces directory. Returns the clone path. */
  async cloneRepo(repo: string): Promise<string> {
    const repoName = repo.split("/").pop()!;
    const clonePath = path.join(this.workspacesRoot, repoName);

    if (fs.existsSync(clonePath)) {
      // Already cloned, fetch latest
      console.log(`Repository already cloned at ${clonePath}, fetching latest...`);
      await execa("git", ["fetch", "--all"], { cwd: clonePath, reject: false });
      return clonePath;
    }

    // Ensure workspaces directory exists
    fs.mkdirSync(this.workspacesRoot, { recursive: true });

    const result = await execa("gh", [
      "repo", "clone", repo, clonePath,
    ], { reject: false });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to clone ${repo}: ${result.stderr}`);
    }

    console.log(`Cloned ${repo} to ${clonePath}`);
    return clonePath;
  }

  /**
   * Set up a worktree for a session: clone the repo, create a coderagent/* branch
   * from the selected base branch, and return the worktree path.
   */
  async setupSessionWorktree(
    repo: string,
    baseBranch: string,
    sessionId: string,
  ): Promise<{ worktreePath: string; branchName: string; repoPath: string }> {
    // Clone (or reuse existing clone)
    const repoPath = await this.cloneRepo(repo);

    // Ensure the base branch is up to date
    await execa("git", ["fetch", "origin", baseBranch], { cwd: repoPath, reject: false });

    // Create a coderagent/* branch name from the session ID
    const shortId = sessionId.substring(0, 8);
    const branchName = `coderagent/${shortId}`;

    // Create the worktree
    const worktreePath = path.join(this.workspacesRoot, `${repo.split("/").pop()}-worktree-${shortId}`);

    if (fs.existsSync(worktreePath)) {
      console.log(`Worktree already exists at ${worktreePath}, reusing.`);
      return { worktreePath, branchName, repoPath };
    }

    // Create new branch from origin/<baseBranch> and worktree simultaneously
    let result = await execa("git", [
      "worktree", "add", worktreePath, "-b", branchName, `origin/${baseBranch}`,
    ], { cwd: repoPath, reject: false });

    if (result.exitCode !== 0) {
      // Branch might already exist
      if (result.stderr.includes("already exists")) {
        result = await execa("git", [
          "worktree", "add", worktreePath, branchName,
        ], { cwd: repoPath, reject: false });
      }
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create worktree: ${result.stderr}`);
      }
    }

    console.log(`Created worktree at ${worktreePath} on branch '${branchName}' (from ${baseBranch})`);
    return { worktreePath, branchName, repoPath };
  }

  /**
   * Create a draft pull request for a session branch.
   * Returns the PR URL.
   */
  async createDraftPr(
    repoPath: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    title: string,
    body: string,
  ): Promise<string | null> {
    // We need at least one commit to create a PR - create an initial empty commit
    await execa("git", [
      "commit", "--allow-empty", "-m", `[CoderAgent] Start session: ${title}`,
    ], { cwd: repoPath, reject: false });

    // Push the branch
    const pushResult = await execa("git", [
      "push", "-u", "origin", branchName,
    ], { cwd: repoPath, reject: false });

    if (pushResult.exitCode !== 0) {
      console.error(`Failed to push branch: ${pushResult.stderr}`);
      return null;
    }

    // Create draft PR
    const prResult = await execa("gh", [
      "pr", "create",
      "--repo", repo,
      "--head", branchName,
      "--base", baseBranch,
      "--title", title,
      "--body", body,
      "--draft",
    ], { cwd: repoPath, reject: false });

    if (prResult.exitCode !== 0) {
      console.error(`Failed to create draft PR: ${prResult.stderr}`);
      return null;
    }

    const prUrl = prResult.stdout.trim();
    console.log(`Draft PR created: ${prUrl}`);
    return prUrl;
  }
}

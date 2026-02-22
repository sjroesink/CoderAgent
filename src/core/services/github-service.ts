import { Octokit } from "octokit";
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
 * Service for interacting with GitHub via Octokit (REST API).
 * Uses a Personal Access Token stored in the database.
 */
export class GitHubService {
  private workspacesRoot: string;
  private token: string | undefined;
  private octokit: Octokit | null = null;

  constructor(workspacesRoot = "/data/workspaces", token?: string) {
    this.workspacesRoot = workspacesRoot;
    if (token) {
      this.setToken(token);
    }
  }

  /** Update the token and recreate the Octokit client. */
  setToken(token: string): void {
    this.token = token;
    this.octokit = new Octokit({ auth: token });
  }

  /** Check if a valid token is configured and return the authenticated user. */
  async getAuthStatus(): Promise<{ authenticated: boolean; username?: string; avatarUrl?: string }> {
    if (!this.token || !this.octokit) {
      return { authenticated: false };
    }
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated();
      return { authenticated: true, username: data.login, avatarUrl: data.avatar_url };
    } catch {
      return { authenticated: false };
    }
  }

  /** List repositories the authenticated user has access to. */
  async listRepos(limit = 50): Promise<GitHubRepo[]> {
    this.ensureAuthenticated();

    const { data } = await this.octokit!.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: limit,
      affiliation: "owner,collaborator,organization_member",
    });

    return data.map((r) => ({
      nameWithOwner: r.full_name,
      description: r.description ?? "",
      url: r.html_url,
      isPrivate: r.private,
      defaultBranch: r.default_branch ?? "main",
    }));
  }

  /** Search repositories by name. */
  async searchRepos(query: string, limit = 30): Promise<GitHubRepo[]> {
    this.ensureAuthenticated();

    try {
      // Search within user's repos
      const { data: user } = await this.octokit!.rest.users.getAuthenticated();
      const { data } = await this.octokit!.rest.search.repos({
        q: `${query} user:${user.login}`,
        per_page: limit,
      });

      return data.items.map((r) => ({
        nameWithOwner: r.full_name,
        description: r.description ?? "",
        url: r.html_url,
        isPrivate: r.private,
        defaultBranch: r.default_branch ?? "main",
      }));
    } catch {
      // Fall back to listing and filtering
      const all = await this.listRepos(100);
      const q = query.toLowerCase();
      return all.filter((r) => r.nameWithOwner.toLowerCase().includes(q));
    }
  }

  /** List branches for a given repository. */
  async listBranches(repo: string, limit = 100): Promise<GitHubBranch[]> {
    this.ensureAuthenticated();

    const [owner, repoName] = repo.split("/");
    const { data } = await this.octokit!.rest.repos.listBranches({
      owner,
      repo: repoName,
      per_page: limit,
    });

    return data.map((b) => ({ name: b.name }));
  }

  /** Clone a repository into the workspaces directory. Returns the clone path. */
  async cloneRepo(repo: string): Promise<string> {
    this.ensureAuthenticated();

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

    // Clone using token-authenticated HTTPS URL
    const cloneUrl = `https://x-access-token:${this.token}@github.com/${repo}.git`;
    const result = await execa("git", ["clone", cloneUrl, clonePath], { reject: false });

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
   * Create a draft pull request for a session branch via the GitHub API.
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
    this.ensureAuthenticated();

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

    // Create draft PR via Octokit
    const [owner, repoName] = repo.split("/");
    try {
      const { data: pr } = await this.octokit!.rest.pulls.create({
        owner,
        repo: repoName,
        head: branchName,
        base: baseBranch,
        title,
        body,
        draft: true,
      });

      console.log(`Draft PR created: ${pr.html_url}`);
      return pr.html_url;
    } catch (err: any) {
      console.error(`Failed to create draft PR: ${err.message}`);
      return null;
    }
  }

  /** Post a comment on a pull request. */
  async postPrComment(repo: string, prNumber: number, body: string): Promise<void> {
    this.ensureAuthenticated();

    const [owner, repoName] = repo.split("/");
    await this.octokit!.rest.issues.createComment({
      owner,
      repo: repoName,
      issue_number: prNumber,
      body,
    });
  }

  private ensureAuthenticated(): void {
    if (!this.token || !this.octokit) {
      throw new Error("GitHub is not connected. Please add a Personal Access Token in Settings.");
    }
  }
}

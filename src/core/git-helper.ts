import { execa } from "execa";
import * as fs from "fs";
import * as path from "path";

/**
 * Manages git worktrees and pull request creation.
 */
export class GitHelper {
  static async createWorktree(repoPath: string, branch: string): Promise<string> {
    const repoName = path.basename(repoPath);
    const parentDir = path.dirname(repoPath);
    const sanitized = branch.replace(/[/\\]/g, "-");
    const worktreePath = path.join(parentDir, `${repoName}-worktree-${sanitized}`);

    if (fs.existsSync(worktreePath)) {
      console.log(`Worktree already exists at ${worktreePath}, reusing it.`);
      return worktreePath;
    }

    let result = await runGit(repoPath, ["worktree", "add", worktreePath, "-b", branch]);
    if (result.exitCode !== 0) {
      if (result.stderr.includes("already exists")) {
        result = await runGit(repoPath, ["worktree", "add", worktreePath, branch]);
      }
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create worktree: ${result.stderr}`);
      }
    }

    console.log(`Created worktree at ${worktreePath} on branch '${branch}'.`);
    return worktreePath;
  }

  static async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const result = await runGit(repoPath, ["worktree", "remove", worktreePath, "--force"]);
    if (result.exitCode !== 0) {
      console.log(`Warning: failed to remove worktree: ${result.stderr}`);
    } else {
      console.log(`Removed worktree at ${worktreePath}.`);
    }
  }

  static async createPullRequest(
    workingDir: string,
    branch: string,
    title: string,
    body: string,
  ): Promise<string | null> {
    // Stage all changes
    let result = await runGit(workingDir, ["add", "-A"]);
    if (result.exitCode !== 0) {
      console.log(`Warning: git add failed: ${result.stderr}`);
      return null;
    }

    // Check for changes
    const diffResult = await runGit(workingDir, ["diff", "--cached", "--stat"]);
    if (!diffResult.stdout.trim()) {
      console.log("No changes to commit.");
      return null;
    }

    // Commit
    result = await runGit(workingDir, ["commit", "-m", title]);
    if (result.exitCode !== 0) {
      console.log(`Warning: git commit failed: ${result.stderr}`);
      return null;
    }

    // Push
    result = await runGit(workingDir, ["push", "-u", "origin", branch]);
    if (result.exitCode !== 0) {
      console.log(`Warning: git push failed: ${result.stderr}`);
      return null;
    }

    // Create PR
    const prResult = await runProcess("gh", [
      "pr", "create",
      "--title", title,
      "--body", body,
      "--head", branch,
    ], workingDir);

    if (prResult.exitCode !== 0) {
      console.log(`Warning: PR creation failed: ${prResult.stderr}`);
      return null;
    }

    const prUrl = prResult.stdout.trim();
    console.log(`Pull request created: ${prUrl}`);
    return prUrl;
  }

  static async getCurrentBranch(workingDir: string): Promise<string | null> {
    const result = await runGit(workingDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }
}

async function runGit(
  workingDir: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runProcess("git", args, workingDir);
}

async function runProcess(
  command: string,
  args: string[],
  workingDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa(command, args, {
    cwd: workingDir,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

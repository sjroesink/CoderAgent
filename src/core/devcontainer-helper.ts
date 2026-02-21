import { execa } from "execa";
import * as fs from "fs";
import * as path from "path";

/**
 * Manages the devcontainer lifecycle: build, up, exec, and down.
 * Requires the devcontainer CLI to be installed.
 */
export class DevContainerHelper {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  static async isAvailable(): Promise<boolean> {
    try {
      const result = await execa("devcontainer", ["--version"]);
      if (result.exitCode === 0) {
        console.log(`devcontainer CLI version: ${result.stdout.trim()}`);
        return true;
      }
    } catch {
      // Not available
    }
    return false;
  }

  async up(): Promise<void> {
    console.log(`Building/starting devcontainer for ${this.workspacePath}...`);

    const result = await execa("devcontainer", [
      "up",
      "--workspace-folder", this.workspacePath,
    ], {
      cwd: this.workspacePath,
      timeout: 600_000, // 10 minutes
    });

    if (result.exitCode !== 0) {
      throw new Error(`devcontainer up failed:\n${result.stderr}`);
    }

    console.log("devcontainer is running.");
  }

  async exec(command: string, timeoutMs = 120_000): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const result = await execa("devcontainer", [
      "exec",
      "--workspace-folder", this.workspacePath,
      ...command.split(" "),
    ], {
      cwd: this.workspacePath,
      timeout: timeoutMs,
      reject: false,
    });

    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  hasDevContainerConfig(): boolean {
    const configPath = path.join(this.workspacePath, ".devcontainer", "devcontainer.json");
    const rootConfig = path.join(this.workspacePath, ".devcontainer.json");
    return fs.existsSync(configPath) || fs.existsSync(rootConfig);
  }
}

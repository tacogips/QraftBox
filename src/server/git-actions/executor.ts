/**
 * Git Actions Executor
 *
 * Executes git actions (commit, push, create-pr) using claude CLI and git commands.
 * This module spawns subprocesses to run git operations via Claude Code agent.
 */

import { buildPrompt } from "./system-prompt.js";

/**
 * Result type for git action execution
 */
export interface GitActionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string | undefined;
}

/**
 * Execute git commit via claude CLI
 *
 * Loads commit system prompt and executes commit via Claude Code agent.
 * The agent will analyze staged changes and create a commit message.
 *
 * @param projectPath - Absolute path to project repository
 * @param customCtx - Optional custom context to append to system prompt
 * @returns Commit execution result
 */
export async function executeCommit(
  projectPath: string,
  customCtx?: string | undefined,
): Promise<GitActionResult> {
  try {
    // Build prompt with commit system prompt
    const prompt = await buildPrompt("commit", customCtx);

    // Spawn claude CLI process
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        prompt,
        "--permission-mode",
        "bypassPermissions",
        "--model",
        "sonnet",
        "--tools",
        "Bash,Read,Grep,Glob",
        "--no-session-persistence",
        "--output-format",
        "text",
      ],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    // Wait for process to complete (5 min timeout)
    const timeoutMs = 5 * 60 * 1000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude CLI timeout")), timeoutMs),
    );

    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    if (exitCode === 0) {
      return {
        success: true,
        output: stdout,
      };
    }

    return {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Claude CLI exited with code ${exitCode}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute commit: ${errorMessage}`,
    };
  }
}

/**
 * Execute git push
 *
 * Pushes local commits to remote repository.
 * If no upstream tracking branch exists, uses `git push -u origin HEAD`.
 *
 * @param projectPath - Absolute path to project repository
 * @returns Push execution result
 */
export async function executePush(
  projectPath: string,
): Promise<GitActionResult> {
  try {
    // First, try standard git push
    let proc = Bun.spawn(["git", "push"], {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Wait for process to complete (2 min timeout)
    const timeoutMs = 2 * 60 * 1000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Git push timeout")), timeoutMs),
    );

    let [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    // If push failed due to no upstream tracking branch, try with -u origin HEAD
    if (exitCode !== 0 && stderr.includes("no upstream branch")) {
      proc = Bun.spawn(["git", "push", "-u", "origin", "HEAD"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ]);
    }

    if (exitCode === 0) {
      // Git writes push output to stderr (even on success)
      const output = stderr.length > 0 ? stderr : stdout;
      return {
        success: true,
        output,
      };
    }

    return {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Git push exited with code ${exitCode}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute push: ${errorMessage}`,
    };
  }
}

/**
 * Execute create PR via claude CLI
 *
 * Loads create-pr system prompt and executes PR creation via Claude Code agent.
 * The agent will analyze commits and create a pull request.
 *
 * @param projectPath - Absolute path to project repository
 * @param baseBranch - Base branch for the pull request (e.g., "main")
 * @param customCtx - Optional custom context to append to system prompt
 * @returns PR creation execution result
 */
export async function executeCreatePR(
  projectPath: string,
  baseBranch: string,
  customCtx?: string | undefined,
): Promise<GitActionResult> {
  try {
    // Build prompt with create-pr system prompt
    // Append base branch information to custom context
    const baseBranchCtx = `Base branch for PR: ${baseBranch}`;
    const fullCustomCtx =
      customCtx !== undefined && customCtx.trim().length > 0
        ? `${baseBranchCtx}\n\n${customCtx}`
        : baseBranchCtx;

    const prompt = await buildPrompt("create-pr", fullCustomCtx);

    // Spawn claude CLI process
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        prompt,
        "--permission-mode",
        "bypassPermissions",
        "--model",
        "sonnet",
        "--tools",
        "Bash,Read,Grep,Glob",
        "--no-session-persistence",
        "--output-format",
        "text",
      ],
      {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    // Wait for process to complete (5 min timeout)
    const timeoutMs = 5 * 60 * 1000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude CLI timeout")), timeoutMs),
    );

    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    if (exitCode === 0) {
      return {
        success: true,
        output: stdout,
      };
    }

    return {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Claude CLI exited with code ${exitCode}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute create-pr: ${errorMessage}`,
    };
  }
}

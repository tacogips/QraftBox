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
 * PR status result
 */
export interface PRStatusResult {
  readonly hasPR: boolean;
  readonly pr: {
    readonly url: string;
    readonly number: number;
    readonly state: string;
    readonly title: string;
  } | null;
  readonly canCreatePR: boolean;
  readonly baseBranch: string;
  readonly availableBaseBranches: readonly string[];
  readonly reason?: string | undefined;
}

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface CancellableProcess {
  kill(): void;
}
const runningActionProcesses = new Map<string, CancellableProcess>();
const cancelledActions = new Set<string>();

/**
 * Track the current git operation phase so that other git-mutating
 * operations (e.g. branch checkout) can be blocked while an operation
 * is in progress.
 */
let currentOperationPhase: "idle" | "committing" | "pushing" | "creating-pr" = "idle";

/**
 * Returns the current operation phase.
 */
export function getOperationPhase(): "idle" | "committing" | "pushing" | "creating-pr" {
  return currentOperationPhase;
}

/**
 * Returns true when any git-mutating operation is in progress.
 */
export function isGitOperationRunning(): boolean {
  return currentOperationPhase !== "idle";
}

interface PRView {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly body: string | null;
}

const PR_PLACEHOLDER_BODY = "Analyzing changes and generating description...";
const PR_PLACEHOLDER_TITLE = "WIP: Analyzing changes...";

function hasPlaceholderPRContent(pr: PRView): boolean {
  const body = (pr.body ?? "").trim().toLowerCase();
  const title = pr.title.trim().toLowerCase();
  return (
    body === PR_PLACEHOLDER_BODY.toLowerCase() ||
    title === PR_PLACEHOLDER_TITLE.toLowerCase()
  );
}

async function runProcessWithTimeout(
  cmd: readonly string[],
  cwd: string,
  timeoutMs: number,
  actionId?: string | undefined,
): Promise<ProcessResult> {
  if (actionId !== undefined && cancelledActions.has(actionId)) {
    throw new Error("Operation cancelled");
  }

  const proc = Bun.spawn([...cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (actionId !== undefined) {
    runningActionProcesses.set(actionId, proc);
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // noop
      }
      reject(new Error("Command timeout"));
    }, timeoutMs);
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    return {
      stdout,
      stderr,
      exitCode,
    };
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
    if (actionId !== undefined) {
      runningActionProcesses.delete(actionId);
    }
  }
}

async function runClaude(
  projectPath: string,
  prompt: string,
  actionId?: string | undefined,
): Promise<GitActionResult> {
  try {
    const { stdout, stderr, exitCode } = await runProcessWithTimeout(
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
      projectPath,
      5 * 60 * 1000,
      actionId,
    );

    if (actionId !== undefined && cancelledActions.has(actionId)) {
      cancelledActions.delete(actionId);
      return {
        success: false,
        output: stdout,
        error: "Operation cancelled by user",
      };
    }

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
    if (actionId !== undefined && cancelledActions.has(actionId)) {
      cancelledActions.delete(actionId);
      return {
        success: false,
        output: "",
        error: "Operation cancelled by user",
      };
    }

    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute claude: ${errorMessage}`,
    };
  }
}

async function getCurrentPRView(projectPath: string): Promise<PRView | null> {
  try {
    const { stdout, exitCode } = await runProcessWithTimeout(
      ["gh", "pr", "view", "--json", "number,url,title,body"],
      projectPath,
      30 * 1000,
    );
    if (exitCode !== 0) {
      return null;
    }

    const parsed = JSON.parse(stdout) as {
      number?: unknown;
      url?: unknown;
      title?: unknown;
      body?: unknown;
    };

    if (
      typeof parsed.number !== "number" ||
      typeof parsed.url !== "string" ||
      typeof parsed.title !== "string"
    ) {
      return null;
    }

    return {
      number: parsed.number,
      url: parsed.url,
      title: parsed.title,
      body: typeof parsed.body === "string" ? parsed.body : null,
    };
  } catch {
    return null;
  }
}

function buildPRRecoveryPrompt(
  baseBranch: string,
  customCtx?: string | undefined,
): string {
  const userContext =
    customCtx !== undefined && customCtx.trim().length > 0
      ? `\nAdditional user context:\n${customCtx.trim()}\n`
      : "";

  return `The current branch already has a PR, but it still contains placeholder content.

Your task is to update that PR so it matches Claude Code /git-pr quality.

Requirements:
- Body must NOT be: "${PR_PLACEHOLDER_BODY}"
- Title must NOT be: "${PR_PLACEHOLDER_TITLE}"
- Write title and body in English
- Body must clearly explain what changed and why
- Include a "## Summary" section and a "## Changes" section
- Include concrete file/component references when possible

Execution steps:
1. Read current PR data: gh pr view --json number,title,body,url,baseRefName,headRefName
2. Analyze changes from GitHub data (not only local assumptions):
   - gh pr diff --name-status
   - gh pr view --json additions,deletions,changedFiles,files
   - git log ${baseBranch}..HEAD --oneline
3. Generate an improved title/body.
4. Update the PR using gh pr edit.
5. Verify with gh pr view --json title,body that placeholder content is gone.
6. Print final PR URL and the updated title.
${userContext}
Do not stop until the PR body is a meaningful description.`;
}

function buildPRUpdatePrompt(
  baseBranch: string,
  customCtx?: string | undefined,
): string {
  const userContext =
    customCtx !== undefined && customCtx.trim().length > 0
      ? `\nAdditional user context:\n${customCtx.trim()}\n`
      : "";

  return `Update the existing GitHub PR for the current branch.

Requirements:
- Keep title/body in English
- Body must clearly explain what changed and why
- Include "## Summary" and "## Changes"
- Reflect the latest commits and file changes

Execution steps:
1. Read current PR: gh pr view --json number,title,body,url,baseRefName,headRefName
2. Analyze latest changes:
   - gh pr diff --name-status
   - gh pr view --json additions,deletions,changedFiles,files
   - git log ${baseBranch}..HEAD --oneline
3. Generate improved title/body for the current state.
4. Update the PR with gh pr edit.
5. Verify updated title/body with gh pr view --json title,body,url.
6. Print PR URL and updated title.
${userContext}
Do not stop until the PR description is updated.`;
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
  actionId?: string | undefined,
): Promise<GitActionResult> {
  currentOperationPhase = "committing";
  try {
    // Build prompt with commit system prompt
    const prompt = await buildPrompt("commit", customCtx);

    return await runClaude(projectPath, prompt, actionId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute commit: ${errorMessage}`,
    };
  } finally {
    currentOperationPhase = "idle";
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
  currentOperationPhase = "pushing";
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
  } finally {
    currentOperationPhase = "idle";
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
  actionId?: string | undefined,
): Promise<GitActionResult> {
  currentOperationPhase = "creating-pr";
  try {
    // Build prompt with create-pr system prompt
    // Append base branch information to custom context
    const baseBranchCtx = `Base branch for PR: ${baseBranch}`;
    const fullCustomCtx =
      customCtx !== undefined && customCtx.trim().length > 0
        ? `${baseBranchCtx}\n\n${customCtx}`
        : baseBranchCtx;

    const prompt = await buildPrompt("create-pr", fullCustomCtx);

    const initial = await runClaude(projectPath, prompt, actionId);
    if (!initial.success) {
      return initial;
    }

    if (actionId !== undefined && cancelledActions.has(actionId)) {
      cancelledActions.delete(actionId);
      return {
        success: false,
        output: initial.output,
        error: "Operation cancelled by user",
      };
    }

    const currentPR = await getCurrentPRView(projectPath);
    if (currentPR === null || !hasPlaceholderPRContent(currentPR)) {
      return initial;
    }

    const recoveryPrompt = buildPRRecoveryPrompt(baseBranch, customCtx);
    const recovery = await runClaude(projectPath, recoveryPrompt, actionId);
    if (!recovery.success) {
      return {
        success: false,
        output: `${initial.output}\n\n${recovery.output}`.trim(),
        error: `PR was created with placeholder content and recovery failed: ${recovery.error ?? "Unknown error"}`,
      };
    }

    const verifiedPR = await getCurrentPRView(projectPath);
    if (verifiedPR !== null && hasPlaceholderPRContent(verifiedPR)) {
      return {
        success: false,
        output: `${initial.output}\n\n${recovery.output}`.trim(),
        error:
          "PR body/title still has placeholder content after recovery attempt",
      };
    }

    return {
      success: true,
      output: `${initial.output}\n\n[QraftBox] Placeholder PR content detected and auto-fixed.`.trim(),
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute create-pr: ${errorMessage}`,
    };
  } finally {
    currentOperationPhase = "idle";
  }
}

/**
 * Execute update PR via claude CLI
 *
 * Uses an update-specific prompt that edits the current PR instead of creating a new one.
 *
 * @param projectPath - Absolute path to project repository
 * @param baseBranch - Base branch for comparison (e.g., "main")
 * @param customCtx - Optional custom context to append to system prompt
 * @returns PR update execution result
 */
export async function executeUpdatePR(
  projectPath: string,
  baseBranch: string,
  customCtx?: string | undefined,
  actionId?: string | undefined,
): Promise<GitActionResult> {
  currentOperationPhase = "creating-pr";
  try {
    const currentPR = await getCurrentPRView(projectPath);
    if (currentPR === null) {
      return {
        success: false,
        output: "",
        error: "No existing PR found for current branch",
      };
    }

    const prompt = buildPRUpdatePrompt(baseBranch, customCtx);
    return await runClaude(projectPath, prompt, actionId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: "",
      error: `Failed to execute update-pr: ${errorMessage}`,
    };
  } finally {
    currentOperationPhase = "idle";
  }
}

/**
 * Cancel a running git action started with actionId.
 *
 * @param actionId - Client-provided action ID
 * @returns true if a running process existed and cancel signal was sent
 */
export async function cancelGitAction(actionId: string): Promise<boolean> {
  cancelledActions.add(actionId);
  const proc = runningActionProcesses.get(actionId);
  if (proc === undefined) {
    return false;
  }

  try {
    proc.kill();
  } catch {
    // keep cancellation best-effort and idempotent
  }
  return true;
}

/**
 * Get PR status for the current branch
 *
 * Checks if a PR exists for the current branch using gh CLI,
 * retrieves available remote branches, and determines if a PR can be created.
 *
 * @param projectPath - Absolute path to project repository
 * @returns PR status information
 */
export async function getPRStatus(
  projectPath: string,
): Promise<PRStatusResult> {
  try {
    // Run gh pr view, git branch, and git rev-parse in parallel
    const timeoutMs = 30 * 1000; // 30 seconds

    // Create timeout promise
    const createTimeout = (): Promise<never> =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Command timeout")), timeoutMs),
      );

    // Execute commands in parallel
    const [ghResult, branchesResult, currentBranchResult, defaultBranchResult] =
      await Promise.all([
        // gh pr view - check if current branch has PR
        (async () => {
          const proc = Bun.spawn(
            [
              "gh",
              "pr",
              "view",
              "--json",
              "url,number,state,title,headRefName,baseRefName",
            ],
            {
              cwd: projectPath,
              stdout: "pipe",
              stderr: "pipe",
            },
          );

          const result = await Promise.race([
            Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]),
            createTimeout(),
          ]);

          return { stdout: result[0], stderr: result[1], exitCode: result[2] };
        })(),

        // git branch -r - get remote branches
        (async () => {
          const proc = Bun.spawn(
            ["git", "branch", "-r", "--list", "origin/*"],
            {
              cwd: projectPath,
              stdout: "pipe",
              stderr: "pipe",
            },
          );

          const result = await Promise.race([
            Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]),
            createTimeout(),
          ]);

          return { stdout: result[0], stderr: result[1], exitCode: result[2] };
        })(),

        // git branch --show-current - get current branch
        (async () => {
          const proc = Bun.spawn(["git", "branch", "--show-current"], {
            cwd: projectPath,
            stdout: "pipe",
            stderr: "pipe",
          });

          const result = await Promise.race([
            Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]),
            createTimeout(),
          ]);

          return { stdout: result[0], stderr: result[1], exitCode: result[2] };
        })(),

        // git symbolic-ref refs/remotes/origin/HEAD - get default branch
        (async () => {
          const proc = Bun.spawn(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            {
              cwd: projectPath,
              stdout: "pipe",
              stderr: "pipe",
            },
          );

          const result = await Promise.race([
            Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]),
            createTimeout(),
          ]);

          return { stdout: result[0], stderr: result[1], exitCode: result[2] };
        })(),
      ]);

    // Parse current branch
    const currentBranch =
      currentBranchResult.exitCode === 0
        ? currentBranchResult.stdout.trim()
        : "";

    // Parse default branch
    let defaultBranch = "main"; // fallback default
    if (defaultBranchResult.exitCode === 0) {
      const ref = defaultBranchResult.stdout.trim();
      const match = /refs\/remotes\/origin\/(.+)$/.exec(ref);
      if (match !== null && match[1] !== undefined) {
        defaultBranch = match[1];
      }
    }

    // Parse PR info
    let hasPR = false;
    let pr: PRStatusResult["pr"] = null;

    if (ghResult.exitCode === 0 && ghResult.stdout.trim().length > 0) {
      try {
        const prData = JSON.parse(ghResult.stdout) as {
          url?: string;
          number?: number;
          state?: string;
          title?: string;
        };
        if (
          typeof prData.url === "string" &&
          typeof prData.number === "number" &&
          typeof prData.state === "string" &&
          typeof prData.title === "string"
        ) {
          hasPR = true;
          pr = {
            url: prData.url,
            number: prData.number,
            state: prData.state,
            title: prData.title,
          };
        }
      } catch {
        // JSON parse failed - treat as no PR
      }
    }

    // Parse available branches
    const availableBranches: string[] = [];
    if (branchesResult.exitCode === 0) {
      const lines = branchesResult.stdout.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        // Remove "origin/" prefix and "-> ..." suffix
        const match = /^origin\/([^\s]+)/.exec(trimmed);
        if (match !== null && match[1] !== undefined) {
          const branch = match[1];
          // Skip HEAD
          if (branch !== "HEAD" && !availableBranches.includes(branch)) {
            availableBranches.push(branch);
          }
        }
      }
    }

    // Sort branches with default branch first
    availableBranches.sort((a, b) => {
      if (a === defaultBranch) return -1;
      if (b === defaultBranch) return 1;
      return a.localeCompare(b);
    });

    // Determine if PR can be created
    const canCreatePR = !hasPR && currentBranch !== defaultBranch;
    const reason =
      hasPR === true
        ? "PR already exists"
        : currentBranch === defaultBranch
          ? "Cannot create PR from default branch"
          : undefined;

    return {
      hasPR,
      pr,
      canCreatePR,
      baseBranch: defaultBranch,
      availableBaseBranches: availableBranches,
      reason,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      hasPR: false,
      pr: null,
      canCreatePR: false,
      baseBranch: "main",
      availableBaseBranches: [],
      reason: `Failed to get PR status: ${errorMessage}`,
    };
  }
}

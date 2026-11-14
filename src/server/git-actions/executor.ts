/**
 * Git Actions Executor
 *
 * Executes git actions (commit, push, create-pr) using claude CLI and git commands.
 * This module spawns subprocesses to run git operations via Claude Code agent.
 */

import type { Subprocess } from "bun";
import { buildPrompt } from "./system-prompt.js";
import type { ResolvedModelProfile } from "../../types/model-config.js";
import { buildAgentAuthEnv } from "../ai/claude-env.js";
import type { ProcessWorkerSource } from "../../../client-shared/src/api/workers.js";
import { processWorkerStore } from "../workers/process-worker-store.js";

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
let currentOperationPhase:
  | "idle"
  | "committing"
  | "pushing"
  | "pulling"
  | "creating-pr"
  | "initializing" = "idle";
let currentOperationWorkerId: string | null = null;

/**
 * Returns the current operation phase.
 */
export function getOperationPhase():
  | "idle"
  | "committing"
  | "pushing"
  | "pulling"
  | "creating-pr"
  | "initializing" {
  return currentOperationPhase;
}

/**
 * Returns true when any git-mutating operation is in progress.
 */
export function isGitOperationRunning(): boolean {
  return currentOperationPhase !== "idle";
}

export function getCurrentOperationWorkerId(): string | null {
  return currentOperationWorkerId;
}

interface PRView {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly body: string | null;
}

const PR_PLACEHOLDER_BODY = "Analyzing changes and generating description...";
const PR_PLACEHOLDER_TITLE = "WIP: Analyzing changes...";
const CREATE_PR_VERIFICATION_ERROR =
  "Create PR command completed but no pull request exists for the current branch";

function hasPlaceholderPRContent(pr: PRView): boolean {
  const body = (pr.body ?? "").trim().toLowerCase();
  const title = pr.title.trim().toLowerCase();
  return (
    body === PR_PLACEHOLDER_BODY.toLowerCase() ||
    title === PR_PLACEHOLDER_TITLE.toLowerCase()
  );
}

function readCommandOptionValue(
  commandArguments: readonly string[],
  optionName: string,
): string | null {
  const optionIndex = commandArguments.indexOf(optionName);
  if (optionIndex === -1) {
    return null;
  }

  const optionValue = commandArguments[optionIndex + 1];
  if (
    optionValue === undefined ||
    optionValue.length === 0 ||
    optionValue.startsWith("-")
  ) {
    return null;
  }

  return optionValue;
}

function formatWorkerCommandText(commandArguments: readonly string[]): string {
  const executableName = commandArguments[0];
  if (executableName === "claude") {
    const modelName = readCommandOptionValue(commandArguments, "--model");
    return modelName === null
      ? "claude -p <prompt redacted>"
      : `claude --model ${modelName} -p <prompt redacted>`;
  }

  if (executableName === "codex") {
    const modelName = readCommandOptionValue(commandArguments, "--model");
    return modelName === null
      ? "codex <prompt redacted>"
      : `codex --model ${modelName} <prompt redacted>`;
  }

  return commandArguments.join(" ");
}

async function runProcessWithTimeout(
  cmd: readonly string[],
  cwd: string,
  timeoutMs: number,
  workerId?: string | undefined,
  env?: Record<string, string> | undefined,
): Promise<ProcessResult> {
  if (workerId !== undefined && cancelledActions.has(workerId)) {
    throw new Error("Operation cancelled");
  }

  const commandText = formatWorkerCommandText(cmd);
  const commandId =
    workerId === undefined
      ? null
      : processWorkerStore.recordCommandStart(workerId, {
          commandText,
          cwd,
        });

  let proc: Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn([...cmd], {
      cwd,
      ...(env !== undefined
        ? {
            env: {
              ...process.env,
              ...env,
            },
          }
        : {}),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    if (workerId !== undefined && commandId !== null) {
      processWorkerStore.recordCommandOutput(workerId, {
        commandId,
        channel: "system",
        text: `Failed to spawn command: ${commandText}`,
      });
      processWorkerStore.recordCommandExit(workerId, {
        commandId,
        exitCode: -1,
        status: "failed",
      });
    }
    throw error;
  }

  if (workerId !== undefined) {
    runningActionProcesses.set(workerId, proc);
  }

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (workerId !== undefined) {
      processWorkerStore.recordCommandOutput(workerId, {
        commandId: commandId ?? undefined,
        channel: "system",
        text: `Command timed out after ${timeoutMs}ms: ${commandText}`,
      });
    }
    try {
      proc.kill();
    } catch {
      // noop
    }
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readProcessOutputStream(proc.stdout, (outputChunk) => {
        if (workerId === undefined) {
          return;
        }
        processWorkerStore.recordCommandOutput(workerId, {
          commandId: commandId ?? undefined,
          channel: "stdout",
          text: outputChunk,
        });
      }),
      readProcessOutputStream(proc.stderr, (outputChunk) => {
        if (workerId === undefined) {
          return;
        }
        processWorkerStore.recordCommandOutput(workerId, {
          commandId: commandId ?? undefined,
          channel: "stderr",
          text: outputChunk,
        });
      }),
      proc.exited,
    ]);

    const wasCancelled =
      workerId !== undefined && cancelledActions.has(workerId);
    if (workerId !== undefined && commandId !== null) {
      processWorkerStore.recordCommandExit(workerId, {
        commandId,
        exitCode: timedOut ? -1 : exitCode,
        status: wasCancelled
          ? "cancelled"
          : timedOut || exitCode !== 0
            ? "failed"
            : "completed",
      });
    }

    if (timedOut) {
      throw new Error("Command timeout");
    }
    if (wasCancelled) {
      throw new Error("Operation cancelled");
    }

    return {
      stdout,
      stderr,
      exitCode,
    };
  } finally {
    clearTimeout(timeoutHandle);
    if (workerId !== undefined) {
      runningActionProcesses.delete(workerId);
    }
  }
}

async function readProcessOutputStream(
  stream: ReadableStream<Uint8Array> | Uint8Array | string | null | undefined,
  onData: (outputChunk: string) => void,
): Promise<string> {
  if (typeof stream === "string") {
    if (stream.length > 0) {
      onData(stream);
    }
    return stream;
  }

  if (stream instanceof Uint8Array) {
    const outputText = new TextDecoder().decode(stream);
    if (outputText.length > 0) {
      onData(outputText);
    }
    return outputText;
  }

  if (stream === null || stream === undefined) {
    return "";
  }

  const outputReader = stream.getReader();
  const textDecoder = new TextDecoder();
  let outputText = "";

  try {
    while (true) {
      const { value: outputBytes, done } = await outputReader.read();
      if (done) {
        break;
      }
      if (outputBytes !== undefined && outputBytes.byteLength > 0) {
        const outputChunk = textDecoder.decode(outputBytes, { stream: true });
        if (outputChunk.length > 0) {
          outputText += outputChunk;
          onData(outputChunk);
        }
      }
    }

    const finalChunk = textDecoder.decode();
    if (finalChunk.length > 0) {
      outputText += finalChunk;
      onData(finalChunk);
    }
  } finally {
    outputReader.releaseLock();
  }

  return outputText;
}

function createWorkerId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `worker-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveWorkerId(workerId?: string | undefined): string {
  return workerId ?? createWorkerId();
}

function resolveAgentWorkerSource(
  modelProfile: ResolvedModelProfile | undefined,
): ProcessWorkerSource {
  return modelProfile?.vendor === "openai"
    ? "codex-agent"
    : "claude-code-agent";
}

function beginWorker(params: {
  readonly workerId: string;
  readonly title: string;
  readonly projectPath: string;
  readonly phase:
    | "committing"
    | "pushing"
    | "pulling"
    | "creating-pr"
    | "initializing";
  readonly source: ProcessWorkerSource;
}): void {
  currentOperationPhase = params.phase;
  currentOperationWorkerId = params.workerId;
  processWorkerStore.createWorker({
    workerId: params.workerId,
    title: params.title,
    projectPath: params.projectPath,
    phase: params.phase,
    source: params.source,
    canCancel: true,
  });
}

function createCancelledResult(output: string): GitActionResult {
  return {
    success: false,
    output,
    error: "Operation cancelled by user",
  };
}

function isWorkerCancelled(workerId?: string | undefined): boolean {
  return workerId !== undefined && cancelledActions.has(workerId);
}

function createFailureResult(prefix: string, error: unknown): GitActionResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    output: "",
    error: `${prefix}: ${errorMessage}`,
  };
}

function finalizeWorker(
  workerId: string,
  result: GitActionResult,
): GitActionResult {
  const status =
    result.success === true
      ? "completed"
      : result.error === "Operation cancelled by user"
        ? "cancelled"
        : "failed";
  processWorkerStore.completeWorker(workerId, {
    status,
    error: result.success ? undefined : result.error,
  });
  if (status === "cancelled") {
    cancelledActions.delete(workerId);
  }
  return result;
}

async function runClaude(
  modelProfile: ResolvedModelProfile | undefined,
  projectPath: string,
  prompt: string,
  workerId?: string | undefined,
): Promise<GitActionResult> {
  const profile = modelProfile ?? {
    profileId: "legacy-default",
    name: "Legacy Default",
    vendor: "anthropics" as const,
    authMode: "cli_auth" as const,
    model: "sonnet",
    arguments: [
      "--permission-mode",
      "bypassPermissions",
      "--tools",
      "Bash,Read,Grep,Glob",
      "--no-session-persistence",
      "--output-format",
      "text",
    ],
  };

  const cmd =
    profile.vendor === "openai"
      ? ["codex", "--model", profile.model, ...profile.arguments, prompt]
      : [
          "claude",
          "-p",
          prompt,
          "--permission-mode",
          "bypassPermissions",
          "--model",
          profile.model,
          "--tools",
          "Bash,Read,Grep,Glob",
          "--no-session-persistence",
          "--output-format",
          "text",
          ...profile.arguments,
        ];

  try {
    const { stdout, stderr, exitCode } = await runProcessWithTimeout(
      cmd,
      projectPath,
      5 * 60 * 1000,
      workerId,
      buildAgentAuthEnv(profile.vendor, profile.authMode),
    );

    if (isWorkerCancelled(workerId)) {
      return createCancelledResult(stdout);
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
  } catch (error) {
    if (isWorkerCancelled(workerId)) {
      return createCancelledResult("");
    }
    return createFailureResult("Failed to execute claude", error);
  }
}

async function getHeadCommitHash(
  projectPath: string,
  workerId?: string | undefined,
): Promise<string | null> {
  try {
    const { stdout, exitCode } = await runProcessWithTimeout(
      ["git", "rev-parse", "HEAD"],
      projectPath,
      5_000,
      workerId,
    );
    if (exitCode !== 0) {
      return null;
    }
    const hash = stdout.trim();
    return hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

async function stageAllChanges(
  projectPath: string,
  workerId?: string | undefined,
): Promise<GitActionResult> {
  try {
    const { stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "add", "-A"],
      projectPath,
      30_000,
      workerId,
    );

    if (exitCode === 0) {
      return { success: true, output: stdout };
    }

    return {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `git add exited with code ${exitCode}`,
    };
  } catch (error) {
    if (isWorkerCancelled(workerId)) {
      return createCancelledResult("");
    }
    return createFailureResult("Failed to stage changes", error);
  }
}

async function listStagedFiles(
  projectPath: string,
  workerId?: string | undefined,
): Promise<readonly string[]> {
  try {
    const { stdout, exitCode } = await runProcessWithTimeout(
      ["git", "diff", "--cached", "--name-only"],
      projectPath,
      10_000,
      workerId,
    );
    if (exitCode !== 0) {
      return [];
    }
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

async function commitStagedChangesFallback(
  projectPath: string,
  stagedFiles: readonly string[],
  workerId?: string | undefined,
): Promise<GitActionResult> {
  const title = "chore: commit staged changes";
  const filesPreview = stagedFiles.slice(0, 20).map((file) => `- ${file}`);
  const truncatedNote =
    stagedFiles.length > 20
      ? `\n- ...and ${stagedFiles.length - 20} more file(s)`
      : "";
  const body = `Fallback commit path executed because AI did not run git commit.\n\nStaged files:\n${filesPreview.join("\n")}${truncatedNote}`;

  try {
    const { stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "commit", "-m", title, "-m", body],
      projectPath,
      30_000,
      workerId,
    );

    if (exitCode === 0) {
      return {
        success: true,
        output: stdout.length > 0 ? stdout : stderr,
      };
    }

    return {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `git commit exited with code ${exitCode}`,
    };
  } catch (error) {
    if (isWorkerCancelled(workerId)) {
      return createCancelledResult("");
    }
    return createFailureResult("Fallback commit failed", error);
  }
}

async function getCurrentPRView(
  projectPath: string,
  workerId?: string | undefined,
): Promise<PRView | null> {
  try {
    const { stdout, exitCode } = await runProcessWithTimeout(
      ["gh", "pr", "view", "--json", "number,url,title,body"],
      projectPath,
      30 * 1000,
      workerId,
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
  outputLanguage = "English",
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
- Write title and body in ${outputLanguage}
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
  outputLanguage = "English",
): string {
  const userContext =
    customCtx !== undefined && customCtx.trim().length > 0
      ? `\nAdditional user context:\n${customCtx.trim()}\n`
      : "";

  return `Update the existing GitHub PR for the current branch.

Requirements:
- Keep title/body in ${outputLanguage}
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
  modelProfile?: ResolvedModelProfile | undefined,
  outputLanguage = "English",
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "AI git commit",
    projectPath,
    phase: "committing",
    source: resolveAgentWorkerSource(modelProfile),
  });
  try {
    const stageResult = await stageAllChanges(projectPath, workerId);
    if (!stageResult.success) {
      return finalizeWorker(workerId, {
        success: false,
        output: stageResult.output,
        error: stageResult.error ?? "Failed to stage changes",
      });
    }

    const beforeHead = await getHeadCommitHash(projectPath, workerId);

    // Build prompt with commit system prompt
    const prompt = await buildPrompt("commit", customCtx, outputLanguage);

    const result = await runClaude(modelProfile, projectPath, prompt, workerId);
    if (!result.success) {
      return finalizeWorker(workerId, result);
    }

    const afterHead = await getHeadCommitHash(projectPath, workerId);
    if (beforeHead === afterHead) {
      const stagedFiles = await listStagedFiles(projectPath, workerId);
      if (stagedFiles.length === 0) {
        return finalizeWorker(workerId, {
          success: false,
          output: result.output,
          error:
            "No commit was created and no staged changes remain. Stage files and try again.",
        });
      }

      const fallbackCommit = await commitStagedChangesFallback(
        projectPath,
        stagedFiles,
        workerId,
      );
      if (fallbackCommit.success) {
        return finalizeWorker(workerId, {
          success: true,
          output: `${result.output}\n\nFallback commit succeeded:\n${fallbackCommit.output}`,
        });
      }

      return finalizeWorker(workerId, {
        success: false,
        output: result.output,
        error: fallbackCommit.error ?? "No commit was created",
      });
    }

    return finalizeWorker(workerId, result);
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute commit", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
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
  actionId?: string | undefined,
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "git push",
    projectPath,
    phase: "pushing",
    source: "git",
  });
  try {
    let { stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "push"],
      projectPath,
      2 * 60 * 1000,
      workerId,
    );

    // If push failed due to no upstream tracking branch, try with -u origin HEAD
    if (exitCode !== 0 && stderr.includes("no upstream branch")) {
      ({ stdout, stderr, exitCode } = await runProcessWithTimeout(
        ["git", "push", "-u", "origin", "HEAD"],
        projectPath,
        2 * 60 * 1000,
        workerId,
      ));
    }

    if (exitCode === 0) {
      // Git writes push output to stderr (even on success)
      const output = stderr.length > 0 ? stderr : stdout;
      return finalizeWorker(workerId, {
        success: true,
        output,
      });
    }

    return finalizeWorker(workerId, {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Git push exited with code ${exitCode}`,
    });
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute push", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
  }
}

/**
 * Execute git pull
 *
 * Fetches and merges changes from remote repository.
 * Runs git fetch origin first, then git pull.
 *
 * @param projectPath - Absolute path to project repository
 * @returns Pull execution result
 */
export async function executePull(
  projectPath: string,
  actionId?: string | undefined,
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "git pull",
    projectPath,
    phase: "pulling",
    source: "git",
  });
  try {
    let { stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "fetch", "origin"],
      projectPath,
      2 * 60 * 1000,
      workerId,
    );

    if (exitCode !== 0) {
      return finalizeWorker(workerId, {
        success: false,
        output: stdout,
        error:
          stderr.length > 0 ? stderr : `Git fetch exited with code ${exitCode}`,
      });
    }

    // Then run git pull
    ({ stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "pull"],
      projectPath,
      2 * 60 * 1000,
      workerId,
    ));

    if (exitCode === 0) {
      // Git writes pull output to stdout or stderr
      const output = stdout.length > 0 ? stdout : stderr;
      return finalizeWorker(workerId, {
        success: true,
        output,
      });
    }

    return finalizeWorker(workerId, {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Git pull exited with code ${exitCode}`,
    });
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute pull", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
  }
}

/**
 * Execute git init
 *
 * Initializes a new git repository in the target directory.
 *
 * @param projectPath - Absolute path to directory
 * @returns Init execution result
 */
export async function executeInit(
  projectPath: string,
  actionId?: string | undefined,
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "git init",
    projectPath,
    phase: "initializing",
    source: "git",
  });
  try {
    const { stdout, stderr, exitCode } = await runProcessWithTimeout(
      ["git", "init"],
      projectPath,
      30 * 1000,
      workerId,
    );

    if (exitCode === 0) {
      const output = stdout.length > 0 ? stdout : stderr;
      return finalizeWorker(workerId, {
        success: true,
        output,
      });
    }

    return finalizeWorker(workerId, {
      success: false,
      output: stdout,
      error:
        stderr.length > 0 ? stderr : `Git init exited with code ${exitCode}`,
    });
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute git init", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
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
  modelProfile?: ResolvedModelProfile | undefined,
  outputLanguage = "English",
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "AI pull request creation",
    projectPath,
    phase: "creating-pr",
    source: resolveAgentWorkerSource(modelProfile),
  });
  try {
    // Build prompt with create-pr system prompt
    // Append base branch information to custom context
    const baseBranchCtx = `Base branch for PR: ${baseBranch}`;
    const fullCustomCtx =
      customCtx !== undefined && customCtx.trim().length > 0
        ? `${baseBranchCtx}\n\n${customCtx}`
        : baseBranchCtx;

    const prompt = await buildPrompt(
      "create-pr",
      fullCustomCtx,
      outputLanguage,
    );

    const initial = await runClaude(
      modelProfile,
      projectPath,
      prompt,
      workerId,
    );
    if (!initial.success) {
      return finalizeWorker(workerId, initial);
    }

    if (isWorkerCancelled(workerId)) {
      return finalizeWorker(workerId, createCancelledResult(initial.output));
    }

    const currentPR = await getCurrentPRView(projectPath, workerId);
    if (currentPR === null) {
      return finalizeWorker(workerId, {
        success: false,
        output: initial.output,
        error: CREATE_PR_VERIFICATION_ERROR,
      });
    }

    if (!hasPlaceholderPRContent(currentPR)) {
      return finalizeWorker(workerId, initial);
    }

    const recoveryPrompt = buildPRRecoveryPrompt(
      baseBranch,
      customCtx,
      outputLanguage,
    );
    const recovery = await runClaude(
      modelProfile,
      projectPath,
      recoveryPrompt,
      workerId,
    );
    if (!recovery.success) {
      return finalizeWorker(workerId, {
        success: false,
        output: `${initial.output}\n\n${recovery.output}`.trim(),
        error: `PR was created with placeholder content and recovery failed: ${recovery.error ?? "Unknown error"}`,
      });
    }

    const verifiedPR = await getCurrentPRView(projectPath, workerId);
    if (verifiedPR === null) {
      return finalizeWorker(workerId, {
        success: false,
        output: `${initial.output}\n\n${recovery.output}`.trim(),
        error: CREATE_PR_VERIFICATION_ERROR,
      });
    }

    if (hasPlaceholderPRContent(verifiedPR)) {
      return finalizeWorker(workerId, {
        success: false,
        output: `${initial.output}\n\n${recovery.output}`.trim(),
        error:
          "PR body/title still has placeholder content after recovery attempt",
      });
    }

    return finalizeWorker(workerId, {
      success: true,
      output:
        `${initial.output}\n\n[QraftBox] Placeholder PR content detected and auto-fixed.`.trim(),
    });
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute create-pr", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
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
  modelProfile?: ResolvedModelProfile | undefined,
  outputLanguage = "English",
): Promise<GitActionResult> {
  const workerId = resolveWorkerId(actionId);
  beginWorker({
    workerId,
    title: "AI pull request update",
    projectPath,
    phase: "creating-pr",
    source: resolveAgentWorkerSource(modelProfile),
  });
  try {
    const currentPR = await getCurrentPRView(projectPath, workerId);
    if (currentPR === null) {
      return finalizeWorker(workerId, {
        success: false,
        output: "",
        error: "No existing PR found for current branch",
      });
    }

    const prompt = buildPRUpdatePrompt(baseBranch, customCtx, outputLanguage);
    return finalizeWorker(
      workerId,
      await runClaude(modelProfile, projectPath, prompt, workerId),
    );
  } catch (error) {
    return finalizeWorker(
      workerId,
      isWorkerCancelled(workerId)
        ? createCancelledResult("")
        : createFailureResult("Failed to execute update-pr", error),
    );
  } finally {
    currentOperationPhase = "idle";
    currentOperationWorkerId = null;
  }
}

/**
 * Cancel a running git action started with actionId.
 *
 * @param actionId - Client-provided action ID
 * @returns true if a running process existed and cancel signal was sent
 */
export async function cancelGitAction(actionId: string): Promise<boolean> {
  const workerDetail = processWorkerStore.getWorker(actionId);
  const canCancelWorker =
    runningActionProcesses.has(actionId) ||
    currentOperationWorkerId === actionId ||
    workerDetail?.status === "running";
  if (!canCancelWorker) {
    return false;
  }

  cancelledActions.add(actionId);
  const proc = runningActionProcesses.get(actionId);
  if (proc === undefined) {
    return true;
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

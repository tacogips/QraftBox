/**
 * Git Actions API Routes
 *
 * REST endpoints for git operations (commit, push, create-pr).
 * Commit and Create PR use Claude Code agent (AI-powered).
 * Push runs git push directly (no AI).
 */

import { Hono } from "hono";
import type {
  GitActionResult,
  PRStatusResult,
} from "../git-actions/executor.js";
import {
  executeCommit,
  executePush,
  executePull,
  executeInit,
  executeCreatePR,
  executeUpdatePR,
  cancelGitAction,
  getPRStatus,
  isGitOperationRunning,
  getOperationPhase,
} from "../git-actions/executor.js";
import { isGitRepository } from "../git/executor.js";
import type { ModelConfigStore } from "../model-config/store.js";
import {
  ensureSystemPromptFiles,
  loadSystemPrompt,
  resolveSystemPromptPath,
  saveSystemPrompt,
  type SystemPromptName,
} from "../git-actions/system-prompt.js";
import {
  ensureAISessionPromptFile,
  getAISessionPromptPath,
  loadAISessionPromptTemplate,
  saveAISessionPromptTemplate,
  type AISessionPromptName,
} from "../claude/session-purpose.js";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Request body for POST /commit
 */
interface CommitRequest {
  readonly projectPath: string;
  readonly customCtx?: string;
  readonly actionId?: string;
  readonly modelProfileId?: string;
}

/**
 * Request body for POST /push
 */
interface PushRequest {
  readonly projectPath: string;
}

/**
 * Request body for POST /pull
 */
interface PullRequest {
  readonly projectPath: string;
}

/**
 * Request body for POST /init
 */
interface InitRequest {
  readonly projectPath: string;
}

/**
 * Request body for POST /create-pr
 */
interface CreatePRRequest {
  readonly projectPath: string;
  readonly baseBranch: string;
  readonly customCtx?: string;
  readonly actionId?: string;
  readonly modelProfileId?: string;
}

/**
 * Request body for POST /cancel
 */
interface CancelRequest {
  readonly actionId: string;
}

type EffectivePromptName = SystemPromptName | AISessionPromptName;

interface EffectivePromptResponse {
  readonly name: EffectivePromptName;
  readonly path: string;
  readonly content: string;
  readonly source: "file" | "fallback";
}

interface UpdateEffectivePromptRequest {
  readonly content: string;
}

/**
 * Validate that a string is non-empty
 *
 * @param value - String to validate
 * @returns true if non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAISessionPromptName(name: string): name is AISessionPromptName {
  return (
    name === "ai-session-purpose" ||
    name === "ai-session-refresh-purpose" ||
    name === "ai-session-resume"
  );
}

/**
 * Validate that projectPath is a git repository
 *
 * @param projectPath - Path to validate
 * @returns Error response if not a git repo, null if valid
 */
async function validateGitRepo(
  projectPath: string,
): Promise<ErrorResponse | null> {
  const isRepo = await isGitRepository(projectPath);
  if (!isRepo) {
    return {
      error:
        "Not a git repository. Git operations are not available for this directory.",
      code: 400,
    };
  }
  return null;
}

/**
 * Create git-actions routes
 *
 * Routes:
 * - POST /commit - Execute AI-powered commit
 * - POST /push - Execute git push (direct, no AI)
 * - POST /pull - Execute git pull (direct, no AI)
 * - POST /init - Initialize git repository in current directory
 * - POST /create-pr - Execute AI-powered PR creation
 * - POST /update-pr - Execute AI-powered PR update
 * - POST /cancel - Cancel running AI commit/PR action
 * - GET /pr-status - Get PR status for current branch
 *
 * @returns Hono app with git-actions routes
 */
export function createGitActionsRoutes(
  modelConfigStore?: ModelConfigStore | undefined,
): Hono {
  const app = new Hono();

  app.get("/prompts/:name", async (c) => {
    const name = c.req.param("name") as EffectivePromptName;
    if (
      name !== "commit" &&
      name !== "create-pr" &&
      !isAISessionPromptName(name)
    ) {
      const errorResponse: ErrorResponse = {
        error:
          "Invalid prompt name: must be commit, create-pr, ai-session-purpose, ai-session-refresh-purpose, or ai-session-resume",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      if (isAISessionPromptName(name)) {
        await ensureAISessionPromptFile(name);
        const template = await loadAISessionPromptTemplate(name);
        const response: EffectivePromptResponse = {
          name,
          path: getAISessionPromptPath(name),
          content: template.template,
          source: template.source,
        };
        return c.json(response);
      }

      await ensureSystemPromptFiles();
      const content = await loadSystemPrompt(name);
      const resolvedPath = resolveSystemPromptPath(name);
      if (resolvedPath === null) {
        throw new Error("System prompt path was not resolved");
      }

      const response: EffectivePromptResponse = {
        name,
        path: resolvedPath,
        content,
        source: "file",
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error
          ? e.message
          : "Failed to load effective prompt configuration";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  app.put("/prompts/:name", async (c) => {
    const name = c.req.param("name") as EffectivePromptName;
    if (
      name !== "commit" &&
      name !== "create-pr" &&
      !isAISessionPromptName(name)
    ) {
      const errorResponse: ErrorResponse = {
        error:
          "Invalid prompt name: must be commit, create-pr, ai-session-purpose, ai-session-refresh-purpose, or ai-session-resume",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const body = await c.req.json<UpdateEffectivePromptRequest>();
      if (!isNonEmptyString(body.content)) {
        return c.json(
          {
            error: "content must be a non-empty string",
            code: 400,
          },
          400,
        );
      }

      if (isAISessionPromptName(name)) {
        await saveAISessionPromptTemplate(name, body.content);
        const saved = await loadAISessionPromptTemplate(name);
        const response: EffectivePromptResponse = {
          name,
          path: getAISessionPromptPath(name),
          content: saved.template,
          source: "file",
        };
        return c.json(response);
      }

      await saveSystemPrompt(name, body.content);
      const content = await loadSystemPrompt(name);
      const resolvedPath = resolveSystemPromptPath(name);
      if (resolvedPath === null) {
        throw new Error("System prompt path was not resolved");
      }
      const response: EffectivePromptResponse = {
        name,
        path: resolvedPath,
        content,
        source: "file",
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to update effective prompt";
      const status = errorMessage.includes("non-empty string") ? 400 : 500;
      return c.json(
        {
          error: errorMessage,
          code: status,
        },
        status,
      );
    }
  });

  /**
   * GET /operating
   *
   * Returns whether a git operation is currently running and its phase.
   */
  app.get("/operating", (c) => {
    return c.json({
      operating: isGitOperationRunning(),
      phase: getOperationPhase(),
    });
  });

  /**
   * POST /commit
   *
   * Execute AI-powered git commit operation.
   */
  app.post("/commit", async (c) => {
    try {
      const body = await c.req.json<CommitRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(body.projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Execute commit
      const result: GitActionResult = await executeCommit(
        body.projectPath,
        body.customCtx,
        body.actionId,
        modelConfigStore?.resolveForOperation(
          "git_commit",
          body.modelProfileId,
        ),
        modelConfigStore?.resolveLanguageForOperation("git_commit"),
      );

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute commit";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /push
   *
   * Execute git push (direct git command, no AI).
   */
  app.post("/push", async (c) => {
    try {
      const body = await c.req.json<PushRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(body.projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Execute push
      const result: GitActionResult = await executePush(body.projectPath);

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute push";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /pull
   *
   * Execute git pull (direct git command, no AI).
   */
  app.post("/pull", async (c) => {
    try {
      const body = await c.req.json<PullRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(body.projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Execute pull
      const result: GitActionResult = await executePull(body.projectPath);

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute pull";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /init
   *
   * Execute git init for non-repository directories.
   */
  app.post("/init", async (c) => {
    try {
      const body = await c.req.json<InitRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Only allow init for non-git directories
      const isRepo = await isGitRepository(body.projectPath);
      if (isRepo) {
        const errorResponse: ErrorResponse = {
          error: "Directory is already a git repository",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      const result: GitActionResult = await executeInit(body.projectPath);
      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute git init";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /create-pr
   *
   * Execute AI-powered pull request creation.
   */
  app.post("/create-pr", async (c) => {
    try {
      const body = await c.req.json<CreatePRRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(body.projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Validate baseBranch
      if (!isNonEmptyString(body.baseBranch)) {
        const errorResponse: ErrorResponse = {
          error: "baseBranch must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Execute create-pr
      const result: GitActionResult = await executeCreatePR(
        body.projectPath,
        body.baseBranch,
        body.customCtx,
        body.actionId,
        modelConfigStore?.resolveForOperation("git_pr", body.modelProfileId),
        modelConfigStore?.resolveLanguageForOperation("git_pr"),
      );

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute create-pr";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /update-pr
   *
   * Execute AI-powered pull request update.
   */
  app.post("/update-pr", async (c) => {
    try {
      const body = await c.req.json<CreatePRRequest>();

      // Validate projectPath
      if (!isNonEmptyString(body.projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(body.projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Validate baseBranch
      if (!isNonEmptyString(body.baseBranch)) {
        const errorResponse: ErrorResponse = {
          error: "baseBranch must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      const result: GitActionResult = await executeUpdatePR(
        body.projectPath,
        body.baseBranch,
        body.customCtx,
        body.actionId,
        modelConfigStore?.resolveForOperation("git_pr", body.modelProfileId),
        modelConfigStore?.resolveLanguageForOperation("git_pr"),
      );

      return c.json(result);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to execute update-pr";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /cancel
   *
   * Cancel running AI action by action ID.
   */
  app.post("/cancel", async (c) => {
    try {
      const body = await c.req.json<CancelRequest>();

      if (!isNonEmptyString(body.actionId)) {
        const errorResponse: ErrorResponse = {
          error: "actionId must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      const cancelled = await cancelGitAction(body.actionId);
      return c.json({
        success: true,
        actionId: body.actionId,
        cancelled,
      });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to cancel action";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /pr-status
   *
   * Get PR status for the current branch.
   * Query params:
   * - projectPath: Absolute path to project repository
   */
  app.get("/pr-status", async (c) => {
    try {
      const projectPath = c.req.query("projectPath");

      // Validate projectPath
      if (!isNonEmptyString(projectPath)) {
        const errorResponse: ErrorResponse = {
          error: "projectPath query parameter must be a non-empty string",
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Validate git repository
      const gitError = await validateGitRepo(projectPath);
      if (gitError !== null) {
        return c.json(gitError, 400);
      }

      // Get PR status
      const status: PRStatusResult = await getPRStatus(projectPath);

      return c.json({ status });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get PR status";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}

/**
 * Git Actions API Routes
 *
 * REST endpoints for AI-powered git operations (commit, push, create-pr).
 */

import { Hono } from "hono";
import type { GitActionResult } from "../git-actions/executor.js";
import {
  executeCommit,
  executePush,
  executeCreatePR,
} from "../git-actions/executor.js";

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
}

/**
 * Request body for POST /push
 */
interface PushRequest {
  readonly projectPath: string;
}

/**
 * Request body for POST /create-pr
 */
interface CreatePRRequest {
  readonly projectPath: string;
  readonly baseBranch: string;
  readonly customCtx?: string;
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

/**
 * Create git-actions routes
 *
 * Routes:
 * - POST /commit - Execute AI-powered commit
 * - POST /push - Execute AI-powered push
 * - POST /create-pr - Execute AI-powered PR creation
 *
 * @returns Hono app with git-actions routes
 */
export function createGitActionsRoutes(): Hono {
  const app = new Hono();

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

      // Execute commit
      const result: GitActionResult = await executeCommit(
        body.projectPath,
        body.customCtx,
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
   * Execute AI-powered git push operation.
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

  return app;
}

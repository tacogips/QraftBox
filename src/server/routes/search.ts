/**
 * Search API Routes
 *
 * Provides REST API endpoints for regex-based search functionality.
 */

import { Hono } from "hono";
import type {
  SearchScope,
  SearchRequest,
  SearchResponse,
  ValidationResult,
} from "../../types/search";
import {
  validateSearchRequest,
  validatePattern,
} from "../../types/search";
import {
  executeSearch,
  type DiffTarget,
} from "../search/index";

/**
 * Server context provided to routes
 */
export interface ServerContext {
  readonly projectPath: string;
  readonly diffTarget: DiffTarget;
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Create search routes
 *
 * @param context - Server context with project path and diff target
 * @returns Hono app with search routes mounted
 */
export function createSearchRoutes(context: ServerContext): Hono {
  const app = new Hono();

  /**
   * GET /api/search
   *
   * Search for a pattern in files based on scope.
   *
   * Query parameters:
   * - pattern (required): Regex pattern to search for
   * - scope (required): 'file' | 'changed' | 'all'
   * - file (optional): File path for 'file' scope
   * - context (optional): Number of context lines (default: 2)
   * - caseSensitive (optional): Case sensitive search (default: false)
   * - maxResults (optional): Maximum results to return (default: 1000)
   */
  app.get("/", async (c) => {
    // Extract query parameters
    const pattern = c.req.query("pattern");
    const scopeParam = c.req.query("scope");
    const filePath = c.req.query("file");
    const contextParam = c.req.query("context");
    const caseSensitiveParam = c.req.query("caseSensitive");
    const maxResultsParam = c.req.query("maxResults");

    // Validate required parameters
    if (pattern === undefined || pattern.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required parameter: pattern",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (scopeParam === undefined || scopeParam.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required parameter: scope",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate scope
    const validScopes: readonly SearchScope[] = ["file", "changed", "all"];
    if (!validScopes.includes(scopeParam as SearchScope)) {
      const errorResponse: ErrorResponse = {
        error: `Invalid scope: ${scopeParam}. Must be one of: ${validScopes.join(", ")}`,
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const scope = scopeParam as SearchScope;

    // Parse optional parameters
    const contextLines =
      contextParam !== undefined ? parseInt(contextParam, 10) : undefined;
    const caseSensitive = caseSensitiveParam === "true";
    const maxResults =
      maxResultsParam !== undefined ? parseInt(maxResultsParam, 10) : undefined;

    // Build search request
    const request: SearchRequest = {
      pattern,
      scope,
      filePath: filePath ?? undefined,
      contextLines,
      caseSensitive,
      maxResults,
    };

    // Validate request
    const validation: ValidationResult = validateSearchRequest(request);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid request",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Execute search
      const { results, filesSearched, truncated } = await executeSearch(
        scope,
        filePath ?? undefined,
        context.diffTarget,
        context.projectPath,
        {
          pattern,
          caseSensitive,
          contextLines,
          maxResults,
        },
        // File reader using Bun's file API
        async (path: string) => {
          const file = Bun.file(path);
          return await file.text();
        }
      );

      // Build response
      const response: SearchResponse = {
        results,
        totalMatches: results.length,
        filesSearched,
        pattern,
        scope,
        truncated,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Search failed";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/search/validate
   *
   * Validate a regex pattern without executing a search.
   *
   * Query parameters:
   * - pattern (required): Regex pattern to validate
   */
  app.get("/validate", (c) => {
    const pattern = c.req.query("pattern");

    if (pattern === undefined || pattern.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required parameter: pattern",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const validation = validatePattern(pattern);
    return c.json(validation);
  });

  return app;
}

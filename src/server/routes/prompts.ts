/**
 * Prompt Template API Routes
 *
 * Provides REST API endpoints for managing prompt templates.
 * Supports listing templates, retrieving content, and managing default selections.
 */

import { Hono } from "hono";
import type { PromptTemplate, PromptContent } from "../../types/prompt-config";
import {
  validatePromptCategory,
  validatePromptId,
} from "../../types/prompt-config";
import {
  loadPrompts,
  loadPromptContent,
  getDefaultPromptId,
  setDefaultPromptId,
} from "../prompts/loader";
import {
  getBuiltinTemplates,
  getBuiltinTemplateContent,
  isBuiltinTemplateId,
} from "../prompts/templates";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
}

/**
 * Response format for GET /api/prompts
 */
interface PromptsListResponse {
  readonly prompts: readonly PromptTemplate[];
}

/**
 * Response format for GET /api/prompts/:id
 */
interface PromptContentResponse {
  readonly content: PromptContent;
}

/**
 * Response format for GET /api/prompts/default/:category
 */
interface DefaultPromptResponse {
  readonly defaultId: string | null;
}

/**
 * Response format for PUT /api/prompts/default/:category
 */
interface SetDefaultResponse {
  readonly success: true;
}

/**
 * Request body for PUT /api/prompts/default/:category
 */
interface SetDefaultRequest {
  readonly id: string;
}

/**
 * Merge builtin and user templates
 *
 * User templates take precedence when there is an ID collision.
 * This allows users to override builtin templates.
 *
 * @param builtinTemplates - Builtin templates
 * @param userTemplates - User templates
 * @returns Merged template array with user templates taking precedence
 */
function mergeTemplates(
  builtinTemplates: readonly PromptTemplate[],
  userTemplates: readonly PromptTemplate[],
): readonly PromptTemplate[] {
  // Create a map of user template IDs for quick lookup
  const userTemplateIds = new Set(userTemplates.map((t) => t.id));

  // Filter out builtin templates that are overridden by user templates
  const nonOverriddenBuiltins = builtinTemplates.filter(
    (t) => !userTemplateIds.has(t.id),
  );

  // Combine: user templates first (take precedence), then non-overridden builtins
  return [...userTemplates, ...nonOverriddenBuiltins];
}

/**
 * Create prompt routes
 *
 * Routes:
 * - GET /api/prompts - List all available prompts (builtin + user)
 * - GET /api/prompts/:id - Get prompt content by ID
 * - GET /api/prompts/default/:category - Get default prompt ID for category
 * - PUT /api/prompts/default/:category - Set default prompt ID for category
 *
 * @param configDir - Optional config directory for user templates
 * @returns Hono app with prompt routes mounted
 */
export function createPromptRoutes(configDir?: string | undefined): Hono {
  const app = new Hono();

  /**
   * GET /api/prompts
   *
   * List all available prompt templates (builtin + user).
   * User templates take precedence on ID collision.
   *
   * Query parameters:
   * - category (optional): Filter by category (commit, push, pr)
   *
   * Returns:
   * - prompts: Array of prompt templates
   */
  app.get("/", async (c) => {
    try {
      // Load user templates
      const userTemplates = await loadPrompts(configDir);

      // Get builtin templates
      const builtinTemplates = getBuiltinTemplates();

      // Merge templates (user takes precedence)
      const allTemplates = mergeTemplates(builtinTemplates, userTemplates);

      // Filter by category if provided
      const categoryParam = c.req.query("category");
      let filteredTemplates = allTemplates;

      if (categoryParam !== undefined && categoryParam.length > 0) {
        const validation = validatePromptCategory(categoryParam);
        if (!validation.valid) {
          const errorResponse: ErrorResponse = {
            error: validation.error ?? "Invalid category",
          };
          return c.json(errorResponse, 400);
        }

        filteredTemplates = allTemplates.filter(
          (t) => t.category === categoryParam,
        );
      }

      const response: PromptsListResponse = {
        prompts: filteredTemplates,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to load prompts";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/prompts/:id
   *
   * Get prompt template content by ID.
   * Supports both builtin and user templates.
   *
   * Path parameters:
   * - id: Template ID
   *
   * Returns:
   * - content: Prompt content with template and frontmatter
   *
   * Error cases:
   * - 400: Invalid template ID format
   * - 404: Template not found
   * - 500: Failed to load template content
   */
  app.get("/:id", async (c) => {
    const id = c.req.param("id");

    // Validate template ID
    const validation = validatePromptId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid template ID",
      };
      return c.json(errorResponse, 400);
    }

    try {
      let content: PromptContent;

      // Check user templates first (they override builtins)
      const userTemplates = await loadPrompts(configDir);
      const userTemplate = userTemplates.find((t) => t.id === id);

      if (userTemplate !== undefined) {
        // User template takes precedence
        content = await loadPromptContent(userTemplate);
      } else if (isBuiltinTemplateId(id)) {
        // Fall back to builtin if no user override
        content = getBuiltinTemplateContent(id);
      } else {
        // Not found in either user or builtin templates
        const errorResponse: ErrorResponse = {
          error: `Template not found: ${id}`,
        };
        return c.json(errorResponse, 404);
      }

      const response: PromptContentResponse = {
        content,
      };
      return c.json(response);
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        const errorResponse: ErrorResponse = {
          error: e.message,
        };
        return c.json(errorResponse, 404);
      }

      const errorMessage =
        e instanceof Error ? e.message : "Failed to load template content";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/prompts/default/:category
   *
   * Get the default prompt ID for a category.
   *
   * Path parameters:
   * - category: Prompt category (commit, push, pr)
   *
   * Returns:
   * - defaultId: Default template ID if set, null otherwise
   *
   * Error cases:
   * - 400: Invalid category
   */
  app.get("/default/:category", async (c) => {
    const category = c.req.param("category");

    // Validate category
    const validation = validatePromptCategory(category);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid category",
      };
      return c.json(errorResponse, 400);
    }

    try {
      const defaultId = await getDefaultPromptId(
        category as "commit" | "push" | "pr",
      );

      const response: DefaultPromptResponse = {
        defaultId,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get default prompt";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * PUT /api/prompts/default/:category
   *
   * Set the default prompt ID for a category.
   *
   * Path parameters:
   * - category: Prompt category (commit, push, pr)
   *
   * Request body:
   * - id: Template ID to set as default
   *
   * Returns:
   * - success: true
   *
   * Error cases:
   * - 400: Invalid category, invalid template ID, or missing request body
   * - 404: Template not found
   * - 500: Failed to set default prompt
   */
  app.put("/default/:category", async (c) => {
    const category = c.req.param("category");

    // Validate category
    const validation = validatePromptCategory(category);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid category",
      };
      return c.json(errorResponse, 400);
    }

    // Parse request body
    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
      };
      return c.json(errorResponse, 400);
    }

    // Validate request body structure
    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("id" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error: "Missing required field: id",
      };
      return c.json(errorResponse, 400);
    }

    const body = requestBody as SetDefaultRequest;

    if (typeof body.id !== "string" || body.id.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "id must be a non-empty string",
      };
      return c.json(errorResponse, 400);
    }

    // Validate template ID format
    const idValidation = validatePromptId(body.id);
    if (!idValidation.valid) {
      const errorResponse: ErrorResponse = {
        error: idValidation.error ?? "Invalid template ID",
      };
      return c.json(errorResponse, 400);
    }

    try {
      // Verify template exists (check both builtin and user templates)
      const isBuiltin = isBuiltinTemplateId(body.id);
      if (!isBuiltin) {
        const userTemplates = await loadPrompts(configDir);
        const templateExists = userTemplates.some((t) => t.id === body.id);

        if (!templateExists) {
          const errorResponse: ErrorResponse = {
            error: `Template not found: ${body.id}`,
          };
          return c.json(errorResponse, 404);
        }
      }

      // Set default
      await setDefaultPromptId(category as "commit" | "push" | "pr", body.id);

      const response: SetDefaultResponse = {
        success: true,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to set default prompt";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}

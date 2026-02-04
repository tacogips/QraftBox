/**
 * Search types for the aynd diff viewer
 *
 * This module defines types for regex-based search functionality
 * with three scopes: file, changed, and all.
 */

/**
 * Search scope types
 * - 'file': Search within current file only
 * - 'changed': Search within changed files only
 * - 'all': Search entire repository
 */
export type SearchScope = "file" | "changed" | "all";

/**
 * Search request parameters
 */
export interface SearchRequest {
  readonly pattern: string;
  readonly scope: SearchScope;
  readonly filePath?: string | undefined;
  readonly contextLines?: number | undefined;
  readonly caseSensitive?: boolean | undefined;
  readonly maxResults?: number | undefined;
}

/**
 * Context lines around a match
 */
export interface SearchResultContext {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/**
 * Single search result match
 */
export interface SearchResult {
  readonly filePath: string;
  readonly lineNumber: number;
  readonly content: string;
  readonly matchStart: number;
  readonly matchEnd: number;
  readonly context?: SearchResultContext | undefined;
}

/**
 * Search response containing all matches
 */
export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly totalMatches: number;
  readonly filesSearched: number;
  readonly pattern: string;
  readonly scope: SearchScope;
  readonly truncated: boolean;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validate search request parameters
 *
 * @param request - The search request to validate
 * @returns Validation result with error message if invalid
 */
export function validateSearchRequest(
  request: SearchRequest
): ValidationResult {
  // Validate pattern
  if (!request.pattern || request.pattern.trim().length === 0) {
    return {
      valid: false,
      error: "Search pattern cannot be empty",
    };
  }

  // Validate pattern is valid regex
  const patternValidation = validatePattern(request.pattern);
  if (!patternValidation.valid) {
    return patternValidation;
  }

  // Validate scope
  const validScopes: readonly SearchScope[] = ["file", "changed", "all"];
  if (!validScopes.includes(request.scope)) {
    return {
      valid: false,
      error: `Invalid scope: ${request.scope}. Must be one of: ${validScopes.join(", ")}`,
    };
  }

  // Validate filePath is provided when scope is 'file'
  if (request.scope === "file") {
    if (!request.filePath || request.filePath.trim().length === 0) {
      return {
        valid: false,
        error: "filePath is required when scope is 'file'",
      };
    }
  }

  // Validate contextLines (if provided)
  if (request.contextLines !== undefined) {
    if (request.contextLines < 0) {
      return {
        valid: false,
        error: "contextLines must be non-negative",
      };
    }
    if (request.contextLines > 20) {
      return {
        valid: false,
        error: "contextLines must not exceed 20",
      };
    }
  }

  // Validate maxResults (if provided)
  if (request.maxResults !== undefined) {
    if (request.maxResults < 1) {
      return {
        valid: false,
        error: "maxResults must be at least 1",
      };
    }
    if (request.maxResults > 10000) {
      return {
        valid: false,
        error: "maxResults must not exceed 10000",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate regex pattern
 *
 * @param pattern - The regex pattern to validate
 * @returns Validation result with error message if invalid
 */
export function validatePattern(pattern: string): ValidationResult {
  if (!pattern || pattern.trim().length === 0) {
    return {
      valid: false,
      error: "Pattern cannot be empty",
    };
  }

  // Pattern length validation (prevent ReDoS)
  if (pattern.length > 500) {
    return {
      valid: false,
      error: "Pattern exceeds maximum length of 500 characters",
    };
  }

  try {
    // Attempt to create regex to validate syntax
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Invalid regular expression";
    return {
      valid: false,
      error: `Invalid regex pattern: ${errorMessage}`,
    };
  }
}

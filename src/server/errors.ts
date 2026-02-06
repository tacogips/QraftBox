/**
 * Server Error Handling
 *
 * Provides AppError class for typed error responses and middleware for
 * converting errors to JSON responses.
 */

import type { Context, ErrorHandler } from "hono";

/**
 * Error codes for API errors
 */
export type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "GIT_ERROR"
  | "INTERNAL_ERROR"
  | "CONFLICT";

/**
 * Application error with typed error code and HTTP status
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Create error handler for Hono app
 *
 * Catches errors thrown by routes and converts them to JSON responses.
 * If error is AppError, uses its statusCode and details.
 * If error is unknown, returns 500 Internal Server Error.
 *
 * Usage:
 * ```typescript
 * const app = new Hono();
 * app.onError(createErrorHandler());
 * app.get("/", () => {
 *   throw notFoundError("Resource not found");
 * });
 * ```
 *
 * @returns Hono error handler
 */
export function createErrorHandler(): ErrorHandler {
  return (err: Error, c: Context): Response => {
    // Handle AppError
    if (err instanceof AppError) {
      const errorResponse: ErrorResponse = {
        error: err.message,
        code: err.statusCode,
        details: err.details,
      };
      return c.json(errorResponse, err.statusCode as 400 | 404 | 409 | 500);
    }

    // Handle standard Error
    if (err instanceof Error) {
      const errorResponse: ErrorResponse = {
        error: err.message,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }

    // Handle unknown error types (shouldn't happen with ErrorHandler type, but be safe)
    const errorResponse: ErrorResponse = {
      error: "Internal server error",
      code: 500,
    };
    return c.json(errorResponse, 500);
  };
}

/**
 * Create NOT_FOUND error (404)
 *
 * @param message - Error message
 * @returns AppError with NOT_FOUND code
 */
export function notFoundError(message: string): AppError {
  return new AppError("NOT_FOUND", message, 404);
}

/**
 * Create VALIDATION_ERROR (400)
 *
 * @param message - Error message
 * @param details - Optional validation details
 * @returns AppError with VALIDATION_ERROR code
 */
export function validationError(
  message: string,
  details?: Record<string, unknown> | undefined,
): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, details);
}

/**
 * Create GIT_ERROR (500)
 *
 * @param message - Error message
 * @param details - Optional git error details
 * @returns AppError with GIT_ERROR code
 */
export function gitError(
  message: string,
  details?: Record<string, unknown> | undefined,
): AppError {
  return new AppError("GIT_ERROR", message, 500, details);
}

/**
 * Create INTERNAL_ERROR (500)
 *
 * @param message - Error message
 * @param details - Optional error details
 * @returns AppError with INTERNAL_ERROR code
 */
export function internalError(
  message: string,
  details?: Record<string, unknown> | undefined,
): AppError {
  return new AppError("INTERNAL_ERROR", message, 500, details);
}

/**
 * Create CONFLICT error (409)
 *
 * @param message - Error message
 * @param details - Optional conflict details
 * @returns AppError with CONFLICT code
 */
export function conflictError(
  message: string,
  details?: Record<string, unknown> | undefined,
): AppError {
  return new AppError("CONFLICT", message, 409, details);
}

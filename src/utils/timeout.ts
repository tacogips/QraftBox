/**
 * Timeout Utility
 *
 * Provides request-level timeout protection for async operations.
 */

/**
 * Error thrown when an operation exceeds its timeout
 */
export class TimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`Operation timed out after ${timeoutMs}ms: ${operation}`);
    this.name = "TimeoutError";
  }
}

/**
 * Wrap a promise with a timeout. If the promise does not resolve within
 * the specified duration, a TimeoutError is thrown.
 *
 * @param promise - The async operation to wrap
 * @param timeoutMs - Maximum time in milliseconds
 * @param operation - Description of the operation (for error messages)
 * @returns The resolved value of the promise
 * @throws TimeoutError if the operation exceeds the timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Default timeout values for different operation types (in milliseconds)
 */
export const ROUTE_TIMEOUTS = {
  /** Commit operations: buildContext + executeCommit */
  COMMIT: 60_000,
  /** Commit preview: buildContext + previewCommit */
  COMMIT_PREVIEW: 60_000,
  /** Staged files listing */
  STAGED_FILES: 30_000,
  /** PR status check (includes GitHub API call) */
  PR_STATUS: 60_000,
  /** PR branch listing */
  PR_BRANCHES: 30_000,
  /** PR creation (includes multiple GitHub API calls) */
  PR_CREATE: 90_000,
  /** PR update (includes multiple GitHub API calls) */
  PR_UPDATE: 90_000,
  /** PR label/reviewer operations */
  PR_METADATA: 30_000,
  /** PR merge operation */
  PR_MERGE: 60_000,
  /** Individual GitHub API call timeout */
  GITHUB_API: 30_000,
} as const;

/**
 * Check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

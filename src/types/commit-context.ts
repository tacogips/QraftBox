/**
 * Commit Context Types for AI-powered git commit feature
 *
 * This module defines types for building commit context and executing
 * AI-powered commit operations within the aynd application.
 */

import type { CommitInfo } from "./commit";

/**
 * File change status codes for staged files
 * - 'A': Added
 * - 'M': Modified
 * - 'D': Deleted
 * - 'R': Renamed
 */
export type StagedFileStatus = "A" | "M" | "D" | "R";

/**
 * Information about a single staged file
 */
export interface StagedFile {
  readonly path: string;
  readonly status: StagedFileStatus;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * Context information for AI commit prompt generation
 *
 * This provides all the necessary information to the AI for generating
 * an appropriate commit message based on the staged changes.
 */
export interface CommitPromptContext {
  readonly stagedFiles: readonly StagedFile[];
  readonly stagedDiff: string;
  readonly branchName: string;
  readonly recentCommits: readonly CommitInfo[];
  readonly repositoryRoot: string;
}

/**
 * Request to execute an AI-powered commit
 *
 * Specifies which prompt template to use and any custom variables
 * for template variable substitution.
 */
export interface CommitRequest {
  readonly promptId: string;
  readonly variables: Record<string, string>;
  readonly dryRun: boolean;
}

/**
 * Result of a commit operation
 *
 * Contains the outcome of the commit attempt, including success/failure
 * status, commit hash, and any error information.
 */
export interface CommitResult {
  readonly success: boolean;
  readonly commitHash: string | null;
  readonly message: string;
  readonly error: string | null;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validate commit prompt context
 *
 * @param context - The commit prompt context to validate
 * @returns Validation result with error message if invalid
 */
export function validateCommitPromptContext(
  context: CommitPromptContext,
): ValidationResult {
  // Validate repository root
  if (!context.repositoryRoot || context.repositoryRoot.trim().length === 0) {
    return {
      valid: false,
      error: "repositoryRoot cannot be empty",
    };
  }

  // Validate branch name
  if (!context.branchName || context.branchName.trim().length === 0) {
    return {
      valid: false,
      error: "branchName cannot be empty",
    };
  }

  // Validate staged files
  if (context.stagedFiles.length === 0) {
    return {
      valid: false,
      error: "stagedFiles cannot be empty",
    };
  }

  // Validate each staged file
  for (const file of context.stagedFiles) {
    const fileValidation = validateStagedFile(file);
    if (!fileValidation.valid) {
      return fileValidation;
    }
  }

  return { valid: true };
}

/**
 * Validate staged file
 *
 * @param file - The staged file to validate
 * @returns Validation result with error message if invalid
 */
export function validateStagedFile(file: StagedFile): ValidationResult {
  // Validate path
  if (!file.path || file.path.trim().length === 0) {
    return {
      valid: false,
      error: "staged file path cannot be empty",
    };
  }

  // Validate status
  const validStatuses: StagedFileStatus[] = ["A", "M", "D", "R"];
  if (!validStatuses.includes(file.status)) {
    return {
      valid: false,
      error: `invalid status: ${file.status}. Must be one of: A, M, D, R`,
    };
  }

  // Validate additions (must be non-negative)
  if (file.additions < 0) {
    return {
      valid: false,
      error: "additions must be non-negative",
    };
  }

  // Validate deletions (must be non-negative)
  if (file.deletions < 0) {
    return {
      valid: false,
      error: "deletions must be non-negative",
    };
  }

  return { valid: true };
}

/**
 * Validate commit request
 *
 * @param request - The commit request to validate
 * @returns Validation result with error message if invalid
 */
export function validateCommitRequest(
  request: CommitRequest,
): ValidationResult {
  // Validate prompt ID
  if (!request.promptId || request.promptId.trim().length === 0) {
    return {
      valid: false,
      error: "promptId cannot be empty",
    };
  }

  // Validate variables object
  if (request.variables === null || typeof request.variables !== "object") {
    return {
      valid: false,
      error: "variables must be an object",
    };
  }

  // Validate variable keys and values
  for (const [key, value] of Object.entries(request.variables)) {
    if (!key || key.trim().length === 0) {
      return {
        valid: false,
        error: "variable keys cannot be empty",
      };
    }

    if (typeof value !== "string") {
      return {
        valid: false,
        error: `variable value for key "${key}" must be a string`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate commit result
 *
 * @param result - The commit result to validate
 * @returns Validation result with error message if invalid
 */
export function validateCommitResult(result: CommitResult): ValidationResult {
  // If success is true, commitHash must be present
  if (result.success && result.commitHash === null) {
    return {
      valid: false,
      error: "commitHash must be present when success is true",
    };
  }

  // If success is false, error should be present
  if (!result.success && result.error === null) {
    return {
      valid: false,
      error: "error should be present when success is false",
    };
  }

  // Validate commit hash format if present
  if (result.commitHash !== null) {
    const hashValidation = validateCommitHash(result.commitHash);
    if (!hashValidation.valid) {
      return hashValidation;
    }
  }

  // Validate message is not empty
  if (!result.message || result.message.trim().length === 0) {
    return {
      valid: false,
      error: "message cannot be empty",
    };
  }

  return { valid: true };
}

/**
 * Validate commit hash format
 *
 * @param hash - The commit hash to validate
 * @returns Validation result with error message if invalid
 */
function validateCommitHash(hash: string): ValidationResult {
  if (!hash || hash.trim().length === 0) {
    return {
      valid: false,
      error: "commit hash cannot be empty",
    };
  }

  // Git commit hashes are 40 character hex strings (SHA-1)
  // or 7+ character short hashes
  const fullHashRegex = /^[0-9a-f]{40}$/i;
  const shortHashRegex = /^[0-9a-f]{7,40}$/i;

  if (!fullHashRegex.test(hash) && !shortHashRegex.test(hash)) {
    return {
      valid: false,
      error: "invalid commit hash format",
    };
  }

  return { valid: true };
}

/**
 * Create an empty commit prompt context
 *
 * @param repositoryRoot - Root directory of the git repository
 * @param branchName - Current branch name
 * @returns Empty commit prompt context
 */
export function createEmptyCommitPromptContext(
  repositoryRoot: string,
  branchName: string,
): CommitPromptContext {
  return {
    stagedFiles: [],
    stagedDiff: "",
    branchName,
    recentCommits: [],
    repositoryRoot,
  };
}

/**
 * Create a default commit request
 *
 * @param promptId - ID of the prompt template to use
 * @returns Default commit request with no custom variables and dryRun=false
 */
export function createDefaultCommitRequest(promptId: string): CommitRequest {
  return {
    promptId,
    variables: {},
    dryRun: false,
  };
}

/**
 * Create a failed commit result
 *
 * @param error - Error message
 * @param message - Additional message describing the failure
 * @returns Failed commit result
 */
export function createFailedCommitResult(
  error: string,
  message: string,
): CommitResult {
  return {
    success: false,
    commitHash: null,
    message,
    error,
  };
}

/**
 * Create a successful commit result
 *
 * @param commitHash - Hash of the created commit
 * @param message - Commit message
 * @returns Successful commit result
 */
export function createSuccessCommitResult(
  commitHash: string,
  message: string,
): CommitResult {
  return {
    success: true,
    commitHash,
    message,
    error: null,
  };
}

/**
 * Calculate total additions across all staged files
 *
 * @param files - Staged files to sum
 * @returns Total number of line additions
 */
export function calculateTotalAdditions(files: readonly StagedFile[]): number {
  return files.reduce((sum, file) => sum + file.additions, 0);
}

/**
 * Calculate total deletions across all staged files
 *
 * @param files - Staged files to sum
 * @returns Total number of line deletions
 */
export function calculateTotalDeletions(files: readonly StagedFile[]): number {
  return files.reduce((sum, file) => sum + file.deletions, 0);
}

/**
 * Count staged files by status
 *
 * @param files - Staged files to count
 * @returns Record mapping status to count
 */
export function countFilesByStatus(
  files: readonly StagedFile[],
): Record<StagedFileStatus, number> {
  const counts: Record<StagedFileStatus, number> = {
    A: 0,
    M: 0,
    D: 0,
    R: 0,
  };

  for (const file of files) {
    counts[file.status]++;
  }

  return counts;
}

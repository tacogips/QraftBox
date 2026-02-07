/**
 * Push Context Types for the qraftbox AI push feature
 *
 * This module defines types for managing git push operations with AI assistance,
 * including push status, context for prompts, and request/response types.
 */

/**
 * Information about a single unpushed commit
 */
export interface UnpushedCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly author: string;
  readonly date: number;
}

/**
 * Context information for AI push prompts
 *
 * Provides all necessary information for the AI to understand the push context
 * and generate appropriate push commands.
 */
export interface PushPromptContext {
  readonly branchName: string;
  readonly remoteName: string;
  readonly remoteBranch: string;
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly customVariables: Record<string, string>;
}

/**
 * Request to execute a push operation with AI
 */
export interface PushRequest {
  readonly promptTemplateId: string;
  readonly remote?: string | undefined;
  readonly branch?: string | undefined;
  readonly force?: boolean | undefined;
  readonly setUpstream?: boolean | undefined;
  readonly pushTags?: boolean | undefined;
  readonly customVariables?: Record<string, string> | undefined;
  readonly dryRun?: boolean | undefined;
}

/**
 * Result of a push operation
 */
export interface PushResult {
  readonly success: boolean;
  readonly remote: string;
  readonly branch: string;
  readonly pushedCommits: number;
  readonly error?: string | undefined;
  readonly sessionId: string;
}

/**
 * Remote tracking information for a branch
 */
export interface RemoteTracking {
  readonly name: string;
  readonly url: string;
  readonly branch: string;
}

/**
 * Current push status for a repository
 *
 * Provides information about whether the repository can be pushed,
 * what commits are unpushed, and any upstream tracking information.
 */
export interface PushStatus {
  readonly canPush: boolean;
  readonly branchName: string;
  readonly remote: RemoteTracking | null;
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly error?: string | undefined;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validate unpushed commit data
 *
 * @param commit - The unpushed commit to validate
 * @returns Validation result with error message if invalid
 */
export function validateUnpushedCommit(
  commit: UnpushedCommit,
): ValidationResult {
  // Validate hash
  if (!commit.hash || commit.hash.trim().length === 0) {
    return {
      valid: false,
      error: "commit hash cannot be empty",
    };
  }

  const fullHashRegex = /^[0-9a-f]{40}$/i;
  const shortHashRegex = /^[0-9a-f]{7,40}$/i;

  if (!fullHashRegex.test(commit.hash) && !shortHashRegex.test(commit.hash)) {
    return {
      valid: false,
      error: "invalid commit hash format",
    };
  }

  // Validate shortHash
  if (!commit.shortHash || commit.shortHash.trim().length === 0) {
    return {
      valid: false,
      error: "commit shortHash cannot be empty",
    };
  }

  const shortHashOnlyRegex = /^[0-9a-f]{7,8}$/i;
  if (!shortHashOnlyRegex.test(commit.shortHash)) {
    return {
      valid: false,
      error: "invalid commit shortHash format (expected 7-8 hex characters)",
    };
  }

  // Validate message
  if (!commit.message || commit.message.trim().length === 0) {
    return {
      valid: false,
      error: "commit message cannot be empty",
    };
  }

  // Validate author
  if (!commit.author || commit.author.trim().length === 0) {
    return {
      valid: false,
      error: "commit author cannot be empty",
    };
  }

  // Validate date
  if (commit.date < 0) {
    return {
      valid: false,
      error: "commit date must be non-negative",
    };
  }

  return { valid: true };
}

/**
 * Validate push request parameters
 *
 * @param request - The push request to validate
 * @returns Validation result with error message if invalid
 */
export function validatePushRequest(request: PushRequest): ValidationResult {
  // Validate promptTemplateId
  if (
    !request.promptTemplateId ||
    request.promptTemplateId.trim().length === 0
  ) {
    return {
      valid: false,
      error: "promptTemplateId cannot be empty",
    };
  }

  // Validate remote if provided
  if (request.remote !== undefined) {
    if (request.remote.trim().length === 0) {
      return {
        valid: false,
        error: "remote cannot be empty string",
      };
    }
  }

  // Validate branch if provided
  if (request.branch !== undefined) {
    if (request.branch.trim().length === 0) {
      return {
        valid: false,
        error: "branch cannot be empty string",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate remote tracking information
 *
 * @param remote - The remote tracking info to validate
 * @returns Validation result with error message if invalid
 */
export function validateRemoteTracking(
  remote: RemoteTracking,
): ValidationResult {
  // Validate name
  if (!remote.name || remote.name.trim().length === 0) {
    return {
      valid: false,
      error: "remote name cannot be empty",
    };
  }

  // Validate URL
  if (!remote.url || remote.url.trim().length === 0) {
    return {
      valid: false,
      error: "remote URL cannot be empty",
    };
  }

  // Validate branch
  if (!remote.branch || remote.branch.trim().length === 0) {
    return {
      valid: false,
      error: "remote branch cannot be empty",
    };
  }

  return { valid: true };
}

/**
 * Validate push prompt context
 *
 * @param context - The push prompt context to validate
 * @returns Validation result with error message if invalid
 */
export function validatePushPromptContext(
  context: PushPromptContext,
): ValidationResult {
  // Validate branchName
  if (!context.branchName || context.branchName.trim().length === 0) {
    return {
      valid: false,
      error: "branchName cannot be empty",
    };
  }

  // Validate remoteName
  if (!context.remoteName || context.remoteName.trim().length === 0) {
    return {
      valid: false,
      error: "remoteName cannot be empty",
    };
  }

  // Validate remoteBranch
  if (!context.remoteBranch || context.remoteBranch.trim().length === 0) {
    return {
      valid: false,
      error: "remoteBranch cannot be empty",
    };
  }

  // Validate aheadCount
  if (context.aheadCount < 0) {
    return {
      valid: false,
      error: "aheadCount must be non-negative",
    };
  }

  // Validate behindCount
  if (context.behindCount < 0) {
    return {
      valid: false,
      error: "behindCount must be non-negative",
    };
  }

  // Validate unpushedCommits
  for (const commit of context.unpushedCommits) {
    const commitValidation = validateUnpushedCommit(commit);
    if (!commitValidation.valid) {
      return commitValidation;
    }
  }

  return { valid: true };
}

/**
 * Create a default push request
 *
 * @param promptTemplateId - ID of the prompt template to use
 * @returns A default push request with common defaults
 */
export function createDefaultPushRequest(
  promptTemplateId: string,
): PushRequest {
  return {
    promptTemplateId,
    remote: undefined,
    branch: undefined,
    force: false,
    setUpstream: false,
    pushTags: false,
    customVariables: {},
    dryRun: false,
  };
}

/**
 * Check if push status indicates ability to push
 *
 * @param status - Push status to check
 * @returns True if repository can be pushed
 */
export function canPushRepository(status: PushStatus): boolean {
  return status.canPush && status.aheadCount > 0;
}

/**
 * Check if push status indicates behind remote
 *
 * @param status - Push status to check
 * @returns True if local branch is behind remote
 */
export function isBehindRemote(status: PushStatus): boolean {
  return status.behindCount > 0;
}

/**
 * Check if push requires force flag
 *
 * @param status - Push status to check
 * @returns True if push would require force flag
 */
export function requiresForcePush(status: PushStatus): boolean {
  return status.aheadCount > 0 && status.behindCount > 0;
}

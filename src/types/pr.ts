/**
 * Pull Request Types
 *
 * Type definitions for AI-powered pull request creation and management.
 * Based on design-docs/specs/design-ai-commit.md
 */

import type { UnpushedCommit } from './push-context.js';

/**
 * Existing pull request information from GitHub
 */
export interface ExistingPR {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly url: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly isDraft: boolean;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
  readonly assignees: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Context for rendering PR prompt templates
 */
export interface PRPromptContext {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly remoteName: string;
  readonly commits: readonly UnpushedCommit[];
  readonly existingPR: ExistingPR | null;
  readonly diffSummary: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly customVariables: Record<string, string>;
}

/**
 * Request to create or update a pull request via AI
 */
export interface PRRequest {
  readonly promptTemplateId: string;
  readonly baseBranch: string;
  readonly title?: string;
  readonly body?: string;
  readonly draft?: boolean;
  readonly labels?: readonly string[];
  readonly reviewers?: readonly string[];
  readonly assignees?: readonly string[];
  readonly customVariables?: Record<string, string>;
}

/**
 * Result of PR creation or update operation
 */
export interface PRResult {
  readonly success: boolean;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly title?: string;
  readonly error?: string;
  readonly sessionId: string;
}

/**
 * Current PR status for a branch
 */
export interface BranchPRStatus {
  readonly hasPR: boolean;
  readonly pr: ExistingPR | null;
  readonly baseBranch: string;
  readonly canCreatePR: boolean;
  readonly reason?: string;
  readonly availableBaseBranches: readonly string[];
  readonly repoOwner: string;
  readonly repoName: string;
}

/**
 * Parameters for creating a new pull request via GitHub API
 */
export interface CreatePRParams {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
  readonly draft?: boolean;
}

/**
 * Parameters for updating an existing pull request
 */
export interface UpdatePRParams {
  readonly title?: string;
  readonly body?: string;
  readonly state?: 'open' | 'closed';
  readonly base?: string;
}

/**
 * Validation functions for PR types
 */

export function validateExistingPR(pr: ExistingPR): string | null {
  if (pr.number <= 0) {
    return 'PR number must be positive';
  }

  if (!pr.title.trim()) {
    return 'PR title cannot be empty';
  }

  if (!pr.url.trim()) {
    return 'PR URL cannot be empty';
  }

  if (!pr.baseBranch.trim()) {
    return 'Base branch cannot be empty';
  }

  if (!pr.headBranch.trim()) {
    return 'Head branch cannot be empty';
  }

  if (pr.createdAt <= 0) {
    return 'Created timestamp must be positive';
  }

  if (pr.updatedAt <= 0) {
    return 'Updated timestamp must be positive';
  }

  if (pr.updatedAt < pr.createdAt) {
    return 'Updated timestamp cannot be before created timestamp';
  }

  return null;
}

export function validatePRPromptContext(
  context: PRPromptContext,
): string | null {
  if (!context.branchName.trim()) {
    return 'Branch name cannot be empty';
  }

  if (!context.baseBranch.trim()) {
    return 'Base branch cannot be empty';
  }

  if (!context.remoteName.trim()) {
    return 'Remote name cannot be empty';
  }

  if (!context.repoOwner.trim()) {
    return 'Repository owner cannot be empty';
  }

  if (!context.repoName.trim()) {
    return 'Repository name cannot be empty';
  }

  if (context.existingPR !== null) {
    const prValidation = validateExistingPR(context.existingPR);
    if (prValidation !== null) {
      return `Existing PR validation failed: ${prValidation}`;
    }
  }

  return null;
}

export function validatePRRequest(request: PRRequest): string | null {
  if (!request.promptTemplateId.trim()) {
    return 'Prompt template ID cannot be empty';
  }

  if (!request.baseBranch.trim()) {
    return 'Base branch cannot be empty';
  }

  if (request.title !== undefined && !request.title.trim()) {
    return 'Title cannot be empty string if provided';
  }

  if (request.body !== undefined && request.body.trim() === '') {
    return 'Body cannot be empty string if provided';
  }

  return null;
}

export function validatePRResult(result: PRResult): string | null {
  if (!result.sessionId.trim()) {
    return 'Session ID cannot be empty';
  }

  if (result.success) {
    if (result.prNumber === undefined || result.prNumber <= 0) {
      return 'PR number is required and must be positive for successful results';
    }

    if (result.prUrl === undefined || !result.prUrl.trim()) {
      return 'PR URL is required for successful results';
    }

    if (result.title === undefined || !result.title.trim()) {
      return 'Title is required for successful results';
    }
  } else {
    if (result.error === undefined || !result.error.trim()) {
      return 'Error message is required for failed results';
    }
  }

  return null;
}

export function validateBranchPRStatus(status: BranchPRStatus): string | null {
  if (!status.baseBranch.trim()) {
    return 'Base branch cannot be empty';
  }

  if (!status.repoOwner.trim()) {
    return 'Repository owner cannot be empty';
  }

  if (!status.repoName.trim()) {
    return 'Repository name cannot be empty';
  }

  if (status.hasPR && status.pr === null) {
    return 'PR is required when hasPR is true';
  }

  if (!status.hasPR && status.pr !== null) {
    return 'PR must be null when hasPR is false';
  }

  if (status.pr !== null) {
    const prValidation = validateExistingPR(status.pr);
    if (prValidation !== null) {
      return `PR validation failed: ${prValidation}`;
    }
  }

  if (!status.canCreatePR && status.reason === undefined) {
    return 'Reason is required when canCreatePR is false';
  }

  return null;
}

export function validateCreatePRParams(
  params: CreatePRParams,
): string | null {
  if (!params.title.trim()) {
    return 'Title cannot be empty';
  }

  if (!params.body.trim()) {
    return 'Body cannot be empty';
  }

  if (!params.head.trim()) {
    return 'Head branch cannot be empty';
  }

  if (!params.base.trim()) {
    return 'Base branch cannot be empty';
  }

  if (params.head === params.base) {
    return 'Head and base branches cannot be the same';
  }

  return null;
}

export function validateUpdatePRParams(
  params: UpdatePRParams,
): string | null {
  if (
    params.title === undefined &&
    params.body === undefined &&
    params.state === undefined &&
    params.base === undefined
  ) {
    return 'At least one field must be provided for update';
  }

  if (params.title !== undefined && !params.title.trim()) {
    return 'Title cannot be empty string if provided';
  }

  if (params.body !== undefined && params.body.trim() === '') {
    return 'Body cannot be empty string if provided';
  }

  if (params.base !== undefined && !params.base.trim()) {
    return 'Base branch cannot be empty string if provided';
  }

  return null;
}

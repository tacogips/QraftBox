import { homedir } from "node:os";
import { join } from "node:path";

// Repository type detection
export type RepositoryType = "main" | "worktree" | "bare" | "not-git";

// Worktree information from git worktree list
export interface WorktreeInfo {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly isMain: boolean;
  readonly locked: boolean;
  readonly prunable: boolean;
  readonly mainRepositoryPath: string; // Path to main repo (for navigation)
}

// Repository detection result
export interface RepositoryDetectionResult {
  readonly type: RepositoryType;
  readonly path: string;
  readonly gitDir: string | null;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}

// Create worktree request
export interface CreateWorktreeRequest {
  readonly branch: string;
  readonly worktreeName?: string;
  readonly createBranch?: boolean;
  readonly baseBranch?: string;
  readonly customPath?: string;
}

// Create worktree result
export interface CreateWorktreeResult {
  readonly success: boolean;
  readonly path: string;
  readonly branch: string;
  readonly error?: string;
}

// Remove worktree result
export interface RemoveWorktreeResult {
  readonly success: boolean;
  readonly removed: boolean;
  readonly error?: string;
}

// Validation result
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Encode project path for filesystem-safe directory names
 * Removes leading slash and replaces all / with __
 *
 * @param projectPath - Absolute project path (e.g., "/home/user/projects/my-app")
 * @returns Encoded path (e.g., "home__user__projects__my-app")
 *
 * @example
 * encodeProjectPath("/home/user/projects/my-app") // => "home__user__projects__my-app"
 * encodeProjectPath("/g/gits/tacogips/aynd") // => "g__gits__tacogips__aynd"
 */
export function encodeProjectPath(projectPath: string): string {
  // Remove leading slash and replace all remaining slashes with __
  const withoutLeading = projectPath.startsWith("/")
    ? projectPath.slice(1)
    : projectPath;
  return withoutLeading.replace(/\//g, "__");
}

/**
 * Decode encoded project path back to original absolute path
 * Replaces __ with / and prepends /
 *
 * @param encoded - Encoded path (e.g., "home__user__projects__my-app")
 * @returns Absolute project path (e.g., "/home/user/projects/my-app")
 *
 * @example
 * decodeProjectPath("home__user__projects__my-app") // => "/home/user/projects/my-app"
 * decodeProjectPath("g__gits__tacogips__aynd") // => "/g/gits/tacogips/aynd"
 */
export function decodeProjectPath(encoded: string): string {
  // Replace __ with / and prepend /
  return `/${encoded.replace(/__/g, "/")}`;
}

/**
 * Generate default worktree path using consistent convention
 * Path format: ~/.local/aynd/worktrees/{encoded_project_path}/{worktree_name}
 *
 * @param projectPath - Absolute project path
 * @param worktreeName - Name for the worktree
 * @returns Full absolute path for the worktree
 *
 * @example
 * generateDefaultWorktreePath("/home/user/projects/my-app", "feature-auth")
 * // => "/home/user/.local/aynd/worktrees/home__user__projects__my-app/feature-auth"
 */
export function generateDefaultWorktreePath(
  projectPath: string,
  worktreeName: string,
): string {
  const encoded = encodeProjectPath(projectPath);
  const base = join(homedir(), ".local", "aynd", "worktrees", encoded);
  return join(base, worktreeName);
}

/**
 * Validate worktree name according to rules:
 * - Not empty
 * - No slashes (/ or \)
 * - No double underscore (__)
 * - Max length 100 characters
 * - Valid characters: alphanumeric, -, _, .
 *
 * @param name - Worktree name to validate
 * @returns ValidationResult with valid flag and optional error message
 *
 * @example
 * validateWorktreeName("feature-auth") // => { valid: true }
 * validateWorktreeName("feature/auth") // => { valid: false, error: "..." }
 */
export function validateWorktreeName(name: string): ValidationResult {
  // Not empty
  if (name.length === 0) {
    return {
      valid: false,
      error: "Worktree name cannot be empty",
    };
  }

  // Max length
  if (name.length > 100) {
    return {
      valid: false,
      error: "Worktree name cannot exceed 100 characters",
    };
  }

  // No slashes
  if (name.includes("/") || name.includes("\\")) {
    return {
      valid: false,
      error: "Worktree name cannot contain slashes (/ or \\)",
    };
  }

  // No double underscore (reserved for path encoding)
  if (name.includes("__")) {
    return {
      valid: false,
      error: "Worktree name cannot contain double underscore (__)",
    };
  }

  // Valid characters: alphanumeric, -, _, .
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error:
        "Worktree name can only contain alphanumeric characters, hyphens, underscores, and dots",
    };
  }

  return { valid: true };
}

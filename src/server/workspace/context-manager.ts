/**
 * Context Manager for Multi-Directory Workspace
 *
 * Manages workspace contexts for multiple git repositories, providing
 * context creation, validation, and retrieval functionality.
 */

import { stat, readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import type {
  ContextId,
  WorkspaceTab,
  ValidationResult,
} from "../../types/workspace";
import {
  createWorkspaceTab,
  validateDirectoryPath,
  validateContextId,
} from "../../types/workspace";
import { detectRepositoryType } from "../git/worktree";
import type { ProjectRegistry } from "./project-registry";
import { createProjectRegistry } from "./project-registry";

/**
 * Server context for existing route handlers
 */
export interface ServerContext {
  readonly projectPath: string;
}

/**
 * Directory validation result with git repository information
 */
export interface DirectoryValidation {
  readonly valid: boolean;
  readonly path: string;
  readonly isGitRepo: boolean;
  readonly repositoryRoot?: string | undefined;
  readonly error?: string | undefined;
  readonly isWorktree: boolean;
  readonly mainRepositoryPath?: string | undefined;
}

/**
 * Context Manager interface for managing workspace contexts
 */
export interface ContextManager {
  /**
   * Create a new context for a directory
   *
   * @param path - Absolute path to directory
   * @returns Workspace tab for the new context
   * @throws Error if path is invalid or inaccessible
   */
  createContext(path: string): Promise<WorkspaceTab>;

  /**
   * Get context by ID
   *
   * @param id - Context ID to retrieve
   * @returns Workspace tab if found, undefined otherwise
   */
  getContext(id: ContextId): WorkspaceTab | undefined;

  /**
   * Remove context by ID
   *
   * @param id - Context ID to remove
   */
  removeContext(id: ContextId): void;

  /**
   * Get all active contexts
   *
   * @returns Readonly array of all workspace tabs
   */
  getAllContexts(): readonly WorkspaceTab[];

  /**
   * Validate directory path
   *
   * @param path - Path to validate
   * @returns Validation result with git repository information
   */
  validateDirectory(path: string): Promise<DirectoryValidation>;

  /**
   * Get server context for use with existing route handlers
   *
   * @param id - Context ID
   * @returns Server context with project path
   * @throws Error if context not found
   */
  getServerContext(id: ContextId): ServerContext;

  /**
   * Get the project registry for slug management
   *
   * @returns Project registry instance
   */
  getProjectRegistry(): ProjectRegistry;
}

/**
 * Check if a directory is a git repository (main repo or worktree)
 *
 * @param dirPath - Directory path to check
 * @returns True if directory contains .git folder or .git file (worktree)
 */
async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    const gitPath = resolve(dirPath, ".git");
    const stats = await stat(gitPath);

    // Case 1: .git is a directory (main repository)
    if (stats.isDirectory()) {
      return true;
    }

    // Case 2: .git is a file (worktree)
    if (stats.isFile()) {
      const content = await readFile(gitPath, "utf-8");
      return content.startsWith("gitdir:");
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Find the git repository root by traversing up the directory tree
 *
 * @param startPath - Starting directory path
 * @returns Repository root path if found, undefined otherwise
 */
async function findRepositoryRoot(
  startPath: string,
): Promise<string | undefined> {
  let currentPath = resolve(startPath);
  const rootPath = "/";

  while (currentPath !== rootPath) {
    const isRepo = await isGitRepository(currentPath);
    if (isRepo) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached filesystem root
      break;
    }
    currentPath = parentPath;
  }

  return undefined;
}

/**
 * Implementation of Context Manager
 */
class ContextManagerImpl implements ContextManager {
  private readonly contexts: Map<ContextId, WorkspaceTab>;
  private readonly registry: ProjectRegistry;

  constructor() {
    this.contexts = new Map();
    this.registry = createProjectRegistry();
  }

  getProjectRegistry(): ProjectRegistry {
    return this.registry;
  }

  async createContext(path: string): Promise<WorkspaceTab> {
    // Validate path format
    const pathValidation: ValidationResult = validateDirectoryPath(path);
    if (!pathValidation.valid) {
      throw new Error(pathValidation.error ?? "Invalid directory path");
    }

    // Resolve to absolute path
    const absolutePath = resolve(path);

    // Validate directory exists and is accessible
    let stats;
    try {
      stats = await stat(absolutePath);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to access directory";
      throw new Error(`Directory not accessible: ${errorMessage}`);
    }

    // Verify it's a directory
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    // Check if directory is a git repository
    const isRepo = await isGitRepository(absolutePath);

    // Detect repository type and worktree information
    const detection = await detectRepositoryType(absolutePath);
    const isWorktree = detection.type === "worktree";
    const mainRepoPath = detection.mainRepositoryPath;
    const worktreeName = detection.worktreeName;

    // Find repository root if it's a git repo or within one
    let repositoryRoot: string;
    if (isRepo) {
      repositoryRoot = absolutePath;
    } else {
      const foundRoot = await findRepositoryRoot(absolutePath);
      if (foundRoot !== undefined) {
        repositoryRoot = foundRoot;
      } else {
        // Not in a git repository, use the directory itself as "root"
        repositoryRoot = absolutePath;
      }
    }

    // Extract directory name for display
    const name = basename(absolutePath);

    // Get or create a persistent URL-safe slug for this project
    const projectSlug = await this.registry.getOrCreateSlug(absolutePath);

    // Create workspace tab with worktree information
    const tab = createWorkspaceTab(
      absolutePath,
      name,
      repositoryRoot,
      isRepo,
      isWorktree,
      mainRepoPath,
      worktreeName,
      projectSlug,
    );

    // Store in contexts map
    this.contexts.set(tab.id, tab);

    return tab;
  }

  getContext(id: ContextId): WorkspaceTab | undefined {
    // Validate context ID format
    const validation: ValidationResult = validateContextId(id);
    if (!validation.valid) {
      return undefined;
    }

    return this.contexts.get(id);
  }

  removeContext(id: ContextId): void {
    // Validate context ID format
    const validation: ValidationResult = validateContextId(id);
    if (!validation.valid) {
      return;
    }

    this.contexts.delete(id);
  }

  getAllContexts(): readonly WorkspaceTab[] {
    return Array.from(this.contexts.values());
  }

  async validateDirectory(path: string): Promise<DirectoryValidation> {
    // Validate path format
    const pathValidation: ValidationResult = validateDirectoryPath(path);
    if (!pathValidation.valid) {
      return {
        valid: false,
        path,
        isGitRepo: false,
        isWorktree: false,
        error: pathValidation.error,
      };
    }

    // Resolve to absolute path
    const absolutePath = resolve(path);

    // Check if directory exists and is accessible
    let stats;
    try {
      stats = await stat(absolutePath);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to access directory";
      return {
        valid: false,
        path: absolutePath,
        isGitRepo: false,
        isWorktree: false,
        error: `Directory not accessible: ${errorMessage}`,
      };
    }

    // Verify it's a directory
    if (!stats.isDirectory()) {
      return {
        valid: false,
        path: absolutePath,
        isGitRepo: false,
        isWorktree: false,
        error: "Path is not a directory",
      };
    }

    // Check if it's a git repository
    const isRepo = await isGitRepository(absolutePath);

    // Detect repository type and worktree information
    const detection = await detectRepositoryType(absolutePath);
    const isWorktree = detection.type === "worktree";
    const mainRepoPath = detection.mainRepositoryPath;

    // Find repository root
    let repositoryRoot: string | undefined;
    if (isRepo) {
      repositoryRoot = absolutePath;
    } else {
      repositoryRoot = await findRepositoryRoot(absolutePath);
    }

    return {
      valid: true,
      path: absolutePath,
      isGitRepo: isRepo,
      repositoryRoot,
      isWorktree,
      mainRepositoryPath: mainRepoPath ?? undefined,
    };
  }

  getServerContext(id: ContextId): ServerContext {
    const tab = this.getContext(id);
    if (tab === undefined) {
      throw new Error(`Context not found: ${id}`);
    }

    return {
      projectPath: tab.path,
    };
  }
}

/**
 * Create a new context manager instance
 *
 * @returns Context manager instance
 */
export function createContextManager(): ContextManager {
  return new ContextManagerImpl();
}

/**
 * PR Executor
 *
 * Orchestrates pull request creation and updates using GitHub API and AI prompts.
 * Based on design-docs/specs/design-ai-commit.md
 */

import type {
  PRRequest,
  PRResult,
  PRPromptContext,
  BranchPRStatus,
  CreatePRParams,
  UpdatePRParams,
} from "../../types/pr.js";
import type { PRService } from "../github/pr-service.js";
import { getPushStatus, getUnpushedCommits } from "../git/push.js";
import { buildPrompt } from "../prompts/builder.js";
import { loadPromptContent, loadPrompts } from "../prompts/loader.js";
import { withTimeout, ROUTE_TIMEOUTS } from "../../utils/timeout.js";

/**
 * Error thrown when PR operations fail
 */
export class PRError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PRError";
  }
}

/**
 * PR Executor interface
 */
export interface PRExecutor {
  /**
   * Get PR status for current branch
   */
  getPRStatus(cwd: string): Promise<BranchPRStatus>;

  /**
   * Get available base branches
   */
  getBaseBranches(cwd: string): Promise<string[]>;

  /**
   * Build PR context for prompt rendering
   */
  buildContext(cwd: string, baseBranch: string): Promise<PRPromptContext>;

  /**
   * Create PR via AI session
   * Returns session ID for tracking
   */
  createPR(
    cwd: string,
    request: PRRequest,
  ): Promise<{ sessionId: string; context: PRPromptContext }>;

  /**
   * Update existing PR
   */
  updatePR(
    cwd: string,
    prNumber: number,
    request: PRRequest,
  ): Promise<{ sessionId: string; context: PRPromptContext }>;

  /**
   * Get repository info from remote URL
   */
  getRepoInfo(cwd: string): Promise<{ owner: string; name: string } | null>;
}

/**
 * Execute git command safely
 */
async function execGit(
  args: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      return null;
    }

    return stdout;
  } catch {
    return null;
  }
}

/**
 * Get current branch name
 */
async function getCurrentBranch(cwd: string): Promise<string | null> {
  const output = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return output ? output.trim() : null;
}

/**
 * Parse GitHub remote URL to extract owner and repo name
 *
 * Supports formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo
 * - git@github.com:owner/repo
 */
function parseGitHubRemoteUrl(
  url: string,
): { owner: string; name: string } | null {
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/,
  );
  if (httpsMatch !== null && httpsMatch[1] && httpsMatch[2]) {
    return {
      owner: httpsMatch[1],
      name: httpsMatch[2],
    };
  }

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
  if (sshMatch !== null && sshMatch[1] && sshMatch[2]) {
    return {
      owner: sshMatch[1],
      name: sshMatch[2],
    };
  }

  return null;
}

/**
 * Get remote URL for origin
 */
async function getRemoteUrl(
  cwd: string,
  remoteName: string = "origin",
): Promise<string | null> {
  const output = await execGit(["remote", "get-url", remoteName], cwd);
  return output ? output.trim() : null;
}

/**
 * Get list of remote branches
 */
async function getRemoteBranches(cwd: string): Promise<string[]> {
  const output = await execGit(["branch", "-r"], cwd);
  if (output === null) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes("HEAD"))
    .map((line) => {
      // Remove remote prefix: origin/main -> main
      const parts = line.split("/");
      return parts.slice(1).join("/");
    })
    .filter((branch) => branch.length > 0);
}

/**
 * Get diff summary for commits
 */
async function getDiffSummary(
  cwd: string,
  baseBranch: string,
  headBranch: string,
): Promise<string> {
  const output = await execGit(
    ["diff", "--stat", `${baseBranch}...${headBranch}`],
    cwd,
  );
  return output ?? "";
}

/**
 * Create PR executor instance
 */
export function createPRExecutor(prService: PRService): PRExecutor {
  return {
    async getRepoInfo(
      cwd: string,
    ): Promise<{ owner: string; name: string } | null> {
      const remoteUrl = await getRemoteUrl(cwd);
      if (remoteUrl === null) {
        return null;
      }

      return parseGitHubRemoteUrl(remoteUrl);
    },

    async getPRStatus(cwd: string): Promise<BranchPRStatus> {
      // Get current branch
      const branch = await getCurrentBranch(cwd);
      if (branch === null) {
        return {
          hasPR: false,
          pr: null,
          baseBranch: "main",
          canCreatePR: false,
          reason: "Could not determine current branch",
          availableBaseBranches: [],
          repoOwner: "",
          repoName: "",
        };
      }

      // Get repo info
      const repoInfo = await this.getRepoInfo(cwd);
      if (repoInfo === null) {
        return {
          hasPR: false,
          pr: null,
          baseBranch: "main",
          canCreatePR: false,
          reason: "Could not determine repository from remote URL",
          availableBaseBranches: [],
          repoOwner: "",
          repoName: "",
        };
      }

      // Check if PR exists for this branch (GitHub API - can be slow)
      const existingPR = await withTimeout(
        prService.getPRForBranch(
          repoInfo.owner,
          repoInfo.name,
          branch,
        ),
        ROUTE_TIMEOUTS.GITHUB_API,
        "getPRStatus:getPRForBranch",
      );

      // Get available base branches
      const availableBaseBranches = await this.getBaseBranches(cwd);

      // Determine default base branch
      const baseBranch = availableBaseBranches.includes("main")
        ? "main"
        : (availableBaseBranches[0] ?? "main");

      // Check if we can create a PR
      if (existingPR !== null) {
        return {
          hasPR: true,
          pr: existingPR,
          baseBranch: existingPR.baseBranch,
          canCreatePR: false,
          reason: "PR already exists for this branch",
          availableBaseBranches,
          repoOwner: repoInfo.owner,
          repoName: repoInfo.name,
        };
      }

      // Check if there are commits to create PR with
      const pushStatus = await getPushStatus(cwd);
      if (
        pushStatus.aheadCount === 0 &&
        pushStatus.unpushedCommits.length === 0
      ) {
        return {
          hasPR: false,
          pr: null,
          baseBranch,
          canCreatePR: false,
          reason: "No commits to create PR with",
          availableBaseBranches,
          repoOwner: repoInfo.owner,
          repoName: repoInfo.name,
        };
      }

      return {
        hasPR: false,
        pr: null,
        baseBranch,
        canCreatePR: true,
        availableBaseBranches,
        repoOwner: repoInfo.owner,
        repoName: repoInfo.name,
      };
    },

    async getBaseBranches(cwd: string): Promise<string[]> {
      const remoteBranches = await getRemoteBranches(cwd);

      // Filter for common base branches
      const commonBaseBranches = [
        "main",
        "master",
        "develop",
        "development",
        "staging",
      ];

      const baseBranches = remoteBranches.filter((branch) =>
        commonBaseBranches.includes(branch),
      );

      // If no common branches found, return all remote branches
      if (baseBranches.length === 0) {
        return remoteBranches;
      }

      return baseBranches;
    },

    async buildContext(
      cwd: string,
      baseBranch: string,
    ): Promise<PRPromptContext> {
      // Get current branch
      const branch = await getCurrentBranch(cwd);
      if (branch === null) {
        throw new PRError("Could not determine current branch", "NO_BRANCH");
      }

      // Get repo info
      const repoInfo = await this.getRepoInfo(cwd);
      if (repoInfo === null) {
        throw new PRError(
          "Could not determine repository from remote URL",
          "NO_REPO_INFO",
        );
      }

      // Get push status
      const pushStatus = await getPushStatus(cwd);
      const remoteName = pushStatus.remote?.name ?? "origin";

      // Get commits
      const commits = await getUnpushedCommits(cwd);

      // Check if PR exists (GitHub API - can be slow)
      const existingPR = await withTimeout(
        prService.getPRForBranch(
          repoInfo.owner,
          repoInfo.name,
          branch,
        ),
        ROUTE_TIMEOUTS.GITHUB_API,
        "buildContext:getPRForBranch",
      );

      // Get diff summary
      const diffSummary = await getDiffSummary(cwd, baseBranch, branch);

      return {
        branchName: branch,
        baseBranch,
        remoteName,
        commits,
        existingPR,
        diffSummary,
        repoOwner: repoInfo.owner,
        repoName: repoInfo.name,
        customVariables: {},
      };
    },

    async createPR(
      cwd: string,
      request: PRRequest,
    ): Promise<{ sessionId: string; context: PRPromptContext }> {
      // Build context
      const context = await this.buildContext(cwd, request.baseBranch);

      // Merge custom variables
      const fullContext: PRPromptContext = {
        ...context,
        customVariables: request.customVariables ?? {},
      };

      // Check if PR already exists
      if (fullContext.existingPR !== null) {
        throw new PRError(
          `PR already exists: #${fullContext.existingPR.number}`,
          "PR_EXISTS",
        );
      }

      // Load prompt template
      const templates = await loadPrompts();
      const template = templates.find((t) => t.id === request.promptTemplateId);
      if (template === undefined) {
        throw new PRError(
          `Prompt template not found: ${request.promptTemplateId}`,
          "TEMPLATE_NOT_FOUND",
        );
      }

      const promptContent = await loadPromptContent(template);

      // Build rendered prompt (used by routes layer for AI session)
      // The routes layer will use this to create the AI session
      void buildPrompt(promptContent.template, {
        branchName: fullContext.branchName,
        baseBranch: fullContext.baseBranch,
        remoteName: fullContext.remoteName,
        commits: fullContext.commits,
        existingPR: fullContext.existingPR,
        diffSummary: fullContext.diffSummary,
        repoOwner: fullContext.repoOwner,
        repoName: fullContext.repoName,
        ...fullContext.customVariables,
      });

      // Generate a session ID
      // In actual implementation, this would create an AI session
      // For now, return a placeholder
      const sessionId = `pr-${Date.now()}`;

      // The actual PR creation will be triggered by the AI session
      // The routes layer will:
      // 1. Create AI session with the rendered prompt
      // 2. AI session will execute git commands to create PR
      // 3. After PR creation, parse result and call prService.createPR()
      // 4. Add labels and reviewers if specified

      return {
        sessionId,
        context: fullContext,
      };
    },

    async updatePR(
      cwd: string,
      prNumber: number,
      request: PRRequest,
    ): Promise<{ sessionId: string; context: PRPromptContext }> {
      // Build context
      const context = await this.buildContext(cwd, request.baseBranch);

      // Get repo info
      const repoInfo = await this.getRepoInfo(cwd);
      if (repoInfo === null) {
        throw new PRError(
          "Could not determine repository from remote URL",
          "NO_REPO_INFO",
        );
      }

      // Verify PR exists (GitHub API - can be slow)
      const existingPR = await withTimeout(
        prService.getPR(
          repoInfo.owner,
          repoInfo.name,
          prNumber,
        ),
        ROUTE_TIMEOUTS.GITHUB_API,
        "updatePR:getPR",
      );
      if (existingPR === null) {
        throw new PRError(`PR #${prNumber} not found`, "PR_NOT_FOUND");
      }

      // Merge custom variables
      const fullContext: PRPromptContext = {
        ...context,
        existingPR,
        customVariables: request.customVariables ?? {},
      };

      // Load prompt template
      const templates = await loadPrompts();
      const template = templates.find((t) => t.id === request.promptTemplateId);
      if (template === undefined) {
        throw new PRError(
          `Prompt template not found: ${request.promptTemplateId}`,
          "TEMPLATE_NOT_FOUND",
        );
      }

      const promptContent = await loadPromptContent(template);

      // Build rendered prompt (used by routes layer for AI session)
      void buildPrompt(promptContent.template, {
        branchName: fullContext.branchName,
        baseBranch: fullContext.baseBranch,
        remoteName: fullContext.remoteName,
        commits: fullContext.commits,
        existingPR: fullContext.existingPR,
        diffSummary: fullContext.diffSummary,
        repoOwner: fullContext.repoOwner,
        repoName: fullContext.repoName,
        ...fullContext.customVariables,
      });

      // Generate a session ID
      // In actual implementation, this would create an AI session
      const sessionId = `pr-update-${Date.now()}`;

      // The actual PR update will be triggered by the AI session
      // Similar to createPR, the routes layer handles AI session orchestration

      return {
        sessionId,
        context: fullContext,
      };
    },
  };
}

/**
 * Execute PR creation with GitHub API
 *
 * This is called after AI session generates PR title and body
 */
export async function executePRCreation(
  prService: PRService,
  repoOwner: string,
  repoName: string,
  params: CreatePRParams,
  request: PRRequest,
): Promise<PRResult> {
  try {
    // Create PR via GitHub API
    const pr = await prService.createPR(repoOwner, repoName, params);

    // Add labels if specified
    if (request.labels !== undefined && request.labels.length > 0) {
      await prService.addLabels(repoOwner, repoName, pr.number, [
        ...request.labels,
      ]);
    }

    // Request reviewers if specified
    if (request.reviewers !== undefined && request.reviewers.length > 0) {
      await prService.requestReviewers(repoOwner, repoName, pr.number, [
        ...request.reviewers,
      ]);
    }

    return {
      success: true,
      prNumber: pr.number,
      prUrl: pr.url,
      title: pr.title,
      sessionId: `pr-${pr.number}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: errorMessage,
      sessionId: `pr-error-${Date.now()}`,
    };
  }
}

/**
 * Execute PR update with GitHub API
 *
 * This is called after AI session generates updated PR content
 */
export async function executePRUpdate(
  prService: PRService,
  repoOwner: string,
  repoName: string,
  prNumber: number,
  params: UpdatePRParams,
  request: PRRequest,
): Promise<PRResult> {
  try {
    // Update PR via GitHub API
    const pr = await prService.updatePR(repoOwner, repoName, prNumber, params);

    // Add new labels if specified
    if (request.labels !== undefined && request.labels.length > 0) {
      await prService.addLabels(repoOwner, repoName, pr.number, [
        ...request.labels,
      ]);
    }

    // Request new reviewers if specified
    if (request.reviewers !== undefined && request.reviewers.length > 0) {
      await prService.requestReviewers(repoOwner, repoName, pr.number, [
        ...request.reviewers,
      ]);
    }

    return {
      success: true,
      prNumber: pr.number,
      prUrl: pr.url,
      title: pr.title,
      sessionId: `pr-${pr.number}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: errorMessage,
      sessionId: `pr-error-${Date.now()}`,
    };
  }
}

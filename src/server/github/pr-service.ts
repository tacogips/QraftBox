/**
 * Pull Request Service
 *
 * Provides operations for managing GitHub pull requests using Octokit.
 * Based on design-docs/specs/design-ai-commit.md
 */

import type { Octokit } from "@octokit/rest";
import { getAuthenticatedClient, type OctokitClientOptions } from "./client.js";
import type {
  ExistingPR,
  CreatePRParams,
  UpdatePRParams,
} from "../../types/pr.js";

/**
 * PR Service interface
 */
export interface PRService {
  /**
   * Get a pull request by number
   */
  getPR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<ExistingPR | null>;

  /**
   * Find a pull request for a specific branch
   */
  getPRForBranch(
    owner: string,
    repo: string,
    head: string,
    base?: string,
  ): Promise<ExistingPR | null>;

  /**
   * List pull requests for a repository
   */
  listPRs(
    owner: string,
    repo: string,
    state?: "open" | "closed" | "all",
  ): Promise<ExistingPR[]>;

  /**
   * Create a new pull request
   */
  createPR(
    owner: string,
    repo: string,
    params: CreatePRParams,
  ): Promise<ExistingPR>;

  /**
   * Update an existing pull request
   */
  updatePR(
    owner: string,
    repo: string,
    prNumber: number,
    params: UpdatePRParams,
  ): Promise<ExistingPR>;

  /**
   * Add labels to a pull request
   */
  addLabels(
    owner: string,
    repo: string,
    prNumber: number,
    labels: string[],
  ): Promise<void>;

  /**
   * Request reviewers for a pull request
   */
  requestReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
  ): Promise<void>;

  /**
   * Merge a pull request
   */
  mergePR(
    owner: string,
    repo: string,
    prNumber: number,
    mergeMethod?: "merge" | "squash" | "rebase",
  ): Promise<{ merged: boolean; message: string }>;
}

/**
 * Options for creating PR service
 */
export interface PRServiceOptions extends OctokitClientOptions {
  /**
   * Custom Octokit instance for testing
   */
  octokit?: Octokit;
}

/**
 * Map GitHub API PR response to ExistingPR
 */
function mapPRResponse(pr: {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  base: { ref: string };
  head: { ref: string };
  draft?: boolean;
  labels: Array<{ name?: string } | string>;
  requested_reviewers?: Array<{ login: string }> | null;
  assignees?: Array<{ login: string }> | null;
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
}): ExistingPR {
  // Determine state - GitHub returns 'open' or 'closed', but we also track 'merged'
  let state: "open" | "closed" | "merged" = pr.state as "open" | "closed";
  if (pr.state === "closed" && pr.merged_at) {
    state = "merged";
  }

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    state,
    url: pr.html_url,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    isDraft: pr.draft ?? false,
    labels: pr.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
    reviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
    assignees: (pr.assignees ?? []).map((a) => a.login),
    createdAt: new Date(pr.created_at).getTime(),
    updatedAt: new Date(pr.updated_at).getTime(),
  };
}

/**
 * Create a PR service instance
 */
export function createPRService(options: PRServiceOptions = {}): PRService {
  let cachedClient: Octokit | null = options.octokit ?? null;

  async function getClient(): Promise<Octokit> {
    if (cachedClient) {
      return cachedClient;
    }
    cachedClient = await getAuthenticatedClient(options);
    return cachedClient;
  }

  return {
    async getPR(
      owner: string,
      repo: string,
      prNumber: number,
    ): Promise<ExistingPR | null> {
      try {
        const client = await getClient();
        const { data } = await client.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });
        return mapPRResponse(data);
      } catch (error) {
        // Return null for 404 (not found)
        if (
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 404
        ) {
          return null;
        }
        throw error;
      }
    },

    async getPRForBranch(
      owner: string,
      repo: string,
      head: string,
      base?: string,
    ): Promise<ExistingPR | null> {
      const client = await getClient();

      // Format head as owner:branch if it doesn't contain ':'
      const formattedHead = head.includes(":") ? head : `${owner}:${head}`;

      const params: {
        owner: string;
        repo: string;
        head: string;
        state: "open" | "closed" | "all";
        base?: string;
      } = {
        owner,
        repo,
        head: formattedHead,
        state: "all",
      };

      if (base !== undefined) {
        params.base = base;
      }

      const { data } = await client.rest.pulls.list(params);

      if (data.length === 0) {
        return null;
      }

      // Return the most recent PR (first in list when sorted by created desc)
      const pr = data[0];
      if (!pr) {
        return null;
      }
      return mapPRResponse(pr);
    },

    async listPRs(
      owner: string,
      repo: string,
      state: "open" | "closed" | "all" = "open",
    ): Promise<ExistingPR[]> {
      const client = await getClient();
      const { data } = await client.rest.pulls.list({
        owner,
        repo,
        state,
        per_page: 100,
      });

      return data.map(mapPRResponse);
    },

    async createPR(
      owner: string,
      repo: string,
      params: CreatePRParams,
    ): Promise<ExistingPR> {
      const client = await getClient();

      const createParams: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        head: string;
        base: string;
        draft?: boolean;
      } = {
        owner,
        repo,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      };

      if (params.draft !== undefined) {
        createParams.draft = params.draft;
      }

      const { data } = await client.rest.pulls.create(createParams);

      return mapPRResponse(data);
    },

    async updatePR(
      owner: string,
      repo: string,
      prNumber: number,
      params: UpdatePRParams,
    ): Promise<ExistingPR> {
      const client = await getClient();

      const updateParams: {
        owner: string;
        repo: string;
        pull_number: number;
        title?: string;
        body?: string;
        state?: "open" | "closed";
        base?: string;
      } = {
        owner,
        repo,
        pull_number: prNumber,
      };

      if (params.title !== undefined) {
        updateParams.title = params.title;
      }
      if (params.body !== undefined) {
        updateParams.body = params.body;
      }
      if (params.state !== undefined) {
        updateParams.state = params.state;
      }
      if (params.base !== undefined) {
        updateParams.base = params.base;
      }

      const { data } = await client.rest.pulls.update(updateParams);

      return mapPRResponse(data);
    },

    async addLabels(
      owner: string,
      repo: string,
      prNumber: number,
      labels: string[],
    ): Promise<void> {
      if (labels.length === 0) {
        return;
      }

      const client = await getClient();
      await client.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels,
      });
    },

    async requestReviewers(
      owner: string,
      repo: string,
      prNumber: number,
      reviewers: string[],
    ): Promise<void> {
      if (reviewers.length === 0) {
        return;
      }

      const client = await getClient();
      await client.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers,
      });
    },

    async mergePR(
      owner: string,
      repo: string,
      prNumber: number,
      mergeMethod: "merge" | "squash" | "rebase" = "merge",
    ): Promise<{ merged: boolean; message: string }> {
      const client = await getClient();
      const { data } = await client.rest.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });
      return {
        merged: data.merged,
        message: data.message,
      };
    },
  };
}

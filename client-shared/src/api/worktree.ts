import { resolveFetchImplementation } from "./fetch";

export interface WorktreeInfo {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly isMain: boolean;
  readonly locked: boolean;
  readonly prunable: boolean;
  readonly mainRepositoryPath: string;
}

export interface WorktreeListResponse {
  readonly worktrees: readonly WorktreeInfo[];
  readonly mainRepository: string;
}

export interface CreateWorktreeInput {
  readonly branch: string;
  readonly worktreeName?: string | undefined;
  readonly createBranch?: boolean | undefined;
  readonly baseBranch?: string | undefined;
  readonly customPath?: string | undefined;
}

export interface CreateWorktreeResponse {
  readonly success: boolean;
  readonly path: string;
  readonly branch: string;
  readonly error?: string | undefined;
}

export interface WorktreeApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface WorktreeApiClient {
  listWorktrees(contextId: string): Promise<WorktreeListResponse>;
  createWorktree(
    contextId: string,
    input: CreateWorktreeInput,
  ): Promise<CreateWorktreeResponse>;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

interface WorktreeApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createWorktreeApiClientConfig(
  options: WorktreeApiClientOptions = {},
): WorktreeApiClientConfig {
  return {
    fetchImplementation: resolveFetchImplementation(
      options.fetchImplementation,
    ),
    apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl ?? "/api"),
  };
}

async function ensureOk(
  response: Response,
  message: string,
): Promise<Response> {
  if (!response.ok) {
    let detail = `${message}: ${response.status}`;

    try {
      const errorPayload = (await response.json()) as ErrorResponse;
      if (
        typeof errorPayload.error === "string" &&
        errorPayload.error.length > 0
      ) {
        detail = errorPayload.error;
      }
    } catch {
      // Keep the response-status fallback when the payload is not JSON.
    }

    throw new Error(detail);
  }

  return response;
}

export function createWorktreeApiClient(
  options: WorktreeApiClientOptions = {},
): WorktreeApiClient {
  const config = createWorktreeApiClientConfig(options);

  return {
    async listWorktrees(contextId: string): Promise<WorktreeListResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/worktree`,
      );
      await ensureOk(response, "Failed to fetch worktrees");
      return (await response.json()) as WorktreeListResponse;
    },
    async createWorktree(
      contextId: string,
      input: CreateWorktreeInput,
    ): Promise<CreateWorktreeResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/worktree`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await ensureOk(response, "Failed to create worktree");
      return (await response.json()) as CreateWorktreeResponse;
    },
  };
}

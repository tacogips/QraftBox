import { resolveFetchImplementation } from "./fetch";

export interface BranchInfo {
  readonly name: string;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly isRemote: boolean;
  readonly lastCommit: {
    readonly hash: string;
    readonly message: string;
    readonly author: string;
    readonly date: number;
  };
  readonly aheadBehind?:
    | {
        readonly ahead: number;
        readonly behind: number;
      }
    | undefined;
}

export interface BranchListResponse {
  readonly branches: readonly BranchInfo[];
  readonly current: string;
  readonly defaultBranch: string;
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

export interface BranchCheckoutResponse {
  readonly success: boolean;
  readonly previousBranch: string;
  readonly currentBranch: string;
  readonly stashCreated?: string | undefined;
  readonly error?: string | undefined;
}

export interface BranchesApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface BranchesApiClient {
  listBranches(
    contextId: string,
    options?: {
      readonly offset?: number | undefined;
      readonly limit?: number | undefined;
      readonly includeRemote?: boolean | undefined;
    },
  ): Promise<BranchListResponse>;
  checkoutBranch(
    contextId: string,
    input: {
      readonly branch: string;
      readonly force?: boolean | undefined;
      readonly stash?: boolean | undefined;
    },
  ): Promise<BranchCheckoutResponse>;
}

interface BranchesApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createBranchesApiClientConfig(
  options: BranchesApiClientOptions = {},
): BranchesApiClientConfig {
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

function createBranchListQuery(options?: {
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
  readonly includeRemote?: boolean | undefined;
}): string {
  const searchParams = new URLSearchParams();
  if (options?.offset !== undefined) {
    searchParams.set("offset", String(options.offset));
  }
  if (options?.limit !== undefined) {
    searchParams.set("limit", String(options.limit));
  }
  if (options?.includeRemote === true) {
    searchParams.set("includeRemote", "true");
  }
  return searchParams.toString();
}

export function createBranchesApiClient(
  options: BranchesApiClientOptions = {},
): BranchesApiClient {
  const config = createBranchesApiClientConfig(options);

  return {
    async listBranches(contextId, options): Promise<BranchListResponse> {
      const branchQuery = createBranchListQuery(options);
      const querySuffix = branchQuery.length > 0 ? `?${branchQuery}` : "";
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/branches${querySuffix}`,
      );
      await ensureOk(response, "Failed to fetch branches");
      return (await response.json()) as BranchListResponse;
    },
    async checkoutBranch(contextId, input): Promise<BranchCheckoutResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/branches/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await ensureOk(response, "Failed to checkout branch");
      return (await response.json()) as BranchCheckoutResponse;
    },
  };
}

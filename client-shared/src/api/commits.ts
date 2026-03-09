import type {
  CommitDetail,
  CommitLogQuery,
  CommitLogResponse,
} from "../../../src/types/commit";
import type { DiffFile } from "../contracts/diff";

export interface CommitApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface CommitApiClient {
  fetchCommitLog(
    contextId: string,
    query?: CommitLogQuery | undefined,
  ): Promise<CommitLogResponse>;
  fetchCommitDetail(contextId: string, hash: string): Promise<CommitDetail>;
  fetchCommitDiff(
    contextId: string,
    hash: string,
  ): Promise<readonly DiffFile[]>;
}

interface CommitApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createCommitApiClientConfig(
  options: CommitApiClientOptions = {},
): CommitApiClientConfig {
  return {
    fetchImplementation: options.fetchImplementation ?? fetch,
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

function createCommitLogQuery(query: CommitLogQuery = {}): string {
  const searchParams = new URLSearchParams();

  if (query.branch !== undefined) {
    searchParams.set("branch", query.branch);
  }
  if (query.limit !== undefined) {
    searchParams.set("limit", String(query.limit));
  }
  if (query.offset !== undefined) {
    searchParams.set("offset", String(query.offset));
  }
  if (query.search !== undefined && query.search.trim().length > 0) {
    searchParams.set("search", query.search.trim());
  }

  return searchParams.toString();
}

async function fetchCommitLogWithConfig(
  contextId: string,
  query: CommitLogQuery,
  config: CommitApiClientConfig,
): Promise<CommitLogResponse> {
  const searchQuery = createCommitLogQuery(query);
  const response = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/commits${
      searchQuery.length > 0 ? `?${searchQuery}` : ""
    }`,
  );
  await ensureOk(response, "Failed to fetch commits");
  return (await response.json()) as CommitLogResponse;
}

async function fetchCommitDetailWithConfig(
  contextId: string,
  hash: string,
  config: CommitApiClientConfig,
): Promise<CommitDetail> {
  const response = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(
      contextId,
    )}/commits/${encodeURIComponent(hash)}`,
  );
  await ensureOk(response, "Failed to fetch commit detail");
  return (await response.json()) as CommitDetail;
}

async function fetchCommitDiffWithConfig(
  contextId: string,
  hash: string,
  config: CommitApiClientConfig,
): Promise<readonly DiffFile[]> {
  const response = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(
      contextId,
    )}/commits/${encodeURIComponent(hash)}/diff`,
  );
  await ensureOk(response, "Failed to fetch commit diff");
  const payload = (await response.json()) as {
    readonly files?: readonly DiffFile[] | undefined;
  };
  return payload.files ?? [];
}

export function createCommitApiClient(
  options: CommitApiClientOptions = {},
): CommitApiClient {
  const config = createCommitApiClientConfig(options);

  return {
    fetchCommitLog: (contextId, query) =>
      fetchCommitLogWithConfig(contextId, query ?? {}, config),
    fetchCommitDetail: (contextId, hash) =>
      fetchCommitDetailWithConfig(contextId, hash, config),
    fetchCommitDiff: (contextId, hash) =>
      fetchCommitDiffWithConfig(contextId, hash, config),
  };
}

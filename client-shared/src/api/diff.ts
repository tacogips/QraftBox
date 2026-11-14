import {
  normalizeDiffResponse,
  type DiffApiResponse,
  type DiffFile,
  type DiffStats,
} from "../contracts/diff";
import { resolveFetchImplementation } from "./fetch";

export interface DiffApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface DiffApiClient {
  fetchContextDiff(
    contextId: string,
    options?: {
      readonly base?: string | undefined;
    },
  ): Promise<{
    readonly files: readonly DiffFile[];
    readonly stats: DiffStats;
  }>;
}

interface DiffApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createDiffApiClientConfig(
  options: DiffApiClientOptions = {},
): DiffApiClientConfig {
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

async function fetchContextDiffWithConfig(
  contextId: string,
  config: DiffApiClientConfig,
  options?: {
    readonly base?: string | undefined;
  },
): Promise<{
  readonly files: readonly DiffFile[];
  readonly stats: DiffStats;
}> {
  const searchParams = new URLSearchParams();
  const trimmedBaseBranch = options?.base?.trim();
  if (trimmedBaseBranch !== undefined && trimmedBaseBranch.length > 0) {
    searchParams.set("base", trimmedBaseBranch);
  }
  const querySuffix =
    searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const diffResponse = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/diff${querySuffix}`,
  );
  await ensureOk(diffResponse, "Failed to fetch context diff");
  const diffPayload = (await diffResponse.json()) as DiffApiResponse;
  return normalizeDiffResponse(diffPayload);
}

export function createDiffApiClient(
  options: DiffApiClientOptions = {},
): DiffApiClient {
  const config = createDiffApiClientConfig(options);

  return {
    fetchContextDiff: (
      contextId: string,
      options?: {
        readonly base?: string | undefined;
      },
    ) => fetchContextDiffWithConfig(contextId, config, options),
  };
}

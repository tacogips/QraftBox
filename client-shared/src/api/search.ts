import type { SearchRequest, SearchResponse } from "../../../src/types/search";
import { resolveFetchImplementation } from "./fetch";

export interface SearchApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface SearchApiClient {
  search(
    contextId: string,
    request: Pick<
      SearchRequest,
      | "pattern"
      | "scope"
      | "caseSensitive"
      | "excludeFileNames"
      | "contextLines"
      | "maxResults"
      | "showIgnored"
      | "showAllFiles"
    >,
  ): Promise<SearchResponse>;
}

interface SearchApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createSearchApiClientConfig(
  options: SearchApiClientOptions = {},
): SearchApiClientConfig {
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
      // Preserve the fallback message when the payload is not JSON.
    }

    throw new Error(detail);
  }

  return response;
}

function createSearchQuery(
  request: Pick<
    SearchRequest,
    | "pattern"
    | "scope"
    | "caseSensitive"
    | "excludeFileNames"
    | "contextLines"
    | "maxResults"
    | "showIgnored"
    | "showAllFiles"
  >,
): string {
  const searchParams = new URLSearchParams({
    pattern: request.pattern,
    scope: request.scope,
  });

  if (request.caseSensitive === true) {
    searchParams.set("caseSensitive", "true");
  }

  if (
    request.excludeFileNames !== undefined &&
    request.excludeFileNames.trim().length > 0
  ) {
    searchParams.set("excludeFileNames", request.excludeFileNames.trim());
  }

  if (request.contextLines !== undefined) {
    searchParams.set("context", String(request.contextLines));
  }

  if (request.maxResults !== undefined) {
    searchParams.set("maxResults", String(request.maxResults));
  }

  if (request.showIgnored === true) {
    searchParams.set("showIgnored", "true");
  }

  if (request.showAllFiles === true) {
    searchParams.set("showAllFiles", "true");
  }

  return searchParams.toString();
}

async function searchWithConfig(
  contextId: string,
  request: Pick<
    SearchRequest,
    | "pattern"
    | "scope"
    | "caseSensitive"
    | "excludeFileNames"
    | "contextLines"
    | "maxResults"
    | "showIgnored"
    | "showAllFiles"
  >,
  config: SearchApiClientConfig,
): Promise<SearchResponse> {
  const searchResponse = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/search?${createSearchQuery(
      request,
    )}`,
  );
  await ensureOk(searchResponse, "Failed to execute regex search");
  return (await searchResponse.json()) as SearchResponse;
}

export function createSearchApiClient(
  options: SearchApiClientOptions = {},
): SearchApiClient {
  const config = createSearchApiClientConfig(options);

  return {
    search: (contextId, request) =>
      searchWithConfig(contextId, request, config),
  };
}

import type { SystemInfo } from "../../../src/types/system-info";

export interface SystemInfoApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface SystemInfoApiClient {
  fetchSystemInfo(): Promise<SystemInfo>;
}

interface SystemInfoApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createSystemInfoApiClientConfig(
  options: SystemInfoApiClientOptions = {},
): SystemInfoApiClientConfig {
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

async function fetchSystemInfoWithConfig(
  config: SystemInfoApiClientConfig,
): Promise<SystemInfo> {
  const response = await config.fetchImplementation(
    `${config.apiBaseUrl}/system-info`,
  );
  await ensureOk(response, "Failed to fetch system info");
  return (await response.json()) as SystemInfo;
}

export function createSystemInfoApiClient(
  options: SystemInfoApiClientOptions = {},
): SystemInfoApiClient {
  const config = createSystemInfoApiClientConfig(options);

  return {
    fetchSystemInfo: () => fetchSystemInfoWithConfig(config),
  };
}

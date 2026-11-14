import { resolveFetchImplementation } from "./fetch";

export interface TerminalApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface TerminalConnectResponse {
  readonly sessionId: string;
  readonly websocketPath: string;
  readonly websocketUrl: string;
  readonly reused: boolean;
}

export type TerminalStatusResponse =
  | { readonly hasSession: false }
  | {
      readonly hasSession: true;
      readonly sessionId: string;
      readonly websocketPath: string;
      readonly websocketUrl: string;
    };

export interface TerminalDisconnectResponse {
  readonly closed: boolean;
}

export interface TerminalApiClient {
  connect(contextId: string): Promise<TerminalConnectResponse>;
  fetchStatus(contextId: string): Promise<TerminalStatusResponse>;
  disconnect(contextId: string): Promise<TerminalDisconnectResponse>;
}

interface TerminalApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createTerminalApiClientConfig(
  options: TerminalApiClientOptions = {},
): TerminalApiClientConfig {
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
      // Preserve the default status-based detail for non-JSON responses.
    }

    throw new Error(detail);
  }

  return response;
}

export function createTerminalApiClient(
  options: TerminalApiClientOptions = {},
): TerminalApiClient {
  const config = createTerminalApiClientConfig(options);

  return {
    async connect(contextId) {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/terminal/connect`,
        {
          method: "POST",
        },
      );
      await ensureOk(response, "Failed to connect terminal");
      return (await response.json()) as TerminalConnectResponse;
    },
    async fetchStatus(contextId) {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/terminal/status`,
      );
      await ensureOk(response, "Failed to fetch terminal status");
      return (await response.json()) as TerminalStatusResponse;
    },
    async disconnect(contextId) {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/terminal/disconnect`,
        {
          method: "POST",
        },
      );
      await ensureOk(response, "Failed to disconnect terminal");
      return (await response.json()) as TerminalDisconnectResponse;
    },
  };
}

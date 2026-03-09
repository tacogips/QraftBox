import type { FrontendStatusResponse } from "../contracts/frontend-status";

export interface FrontendStatusApiClient {
  fetchFrontendStatus(): Promise<FrontendStatusResponse>;
}

export interface CreateFrontendStatusApiClientOptions {
  readonly apiBaseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

interface FrontendStatusErrorResponse {
  readonly error?: string | undefined;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function createFrontendStatusApiClient(
  options: CreateFrontendStatusApiClientOptions = {},
): FrontendStatusApiClient {
  const apiBaseUrl = trimTrailingSlashes(options.apiBaseUrl ?? "/api");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async fetchFrontendStatus(): Promise<FrontendStatusResponse> {
      const response = await fetchImpl(`${apiBaseUrl}/frontend-status`);
      if (!response.ok) {
        let errorMessage = "Failed to load frontend status";
        try {
          const payload =
            (await response.json()) as FrontendStatusErrorResponse | null;
          if (payload?.error !== undefined && payload.error.length > 0) {
            errorMessage = payload.error;
          }
        } catch {
          // Ignore invalid error payloads and keep the fallback message.
        }

        throw new Error(errorMessage);
      }

      return (await response.json()) as FrontendStatusResponse;
    },
  };
}

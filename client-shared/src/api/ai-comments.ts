import { resolveFetchImplementation } from "./fetch";

export type AiCommentSource = "diff" | "current-state" | "full-file";
export type AiCommentSide = "old" | "new";

export interface QueuedAiComment {
  readonly id: string;
  readonly projectPath: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly side: AiCommentSide;
  readonly source: AiCommentSource;
  readonly prompt: string;
  readonly createdAt: number;
}

export interface QueueAiCommentInput {
  readonly projectPath: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly side: AiCommentSide;
  readonly source: AiCommentSource;
  readonly prompt: string;
}

export interface AiCommentsApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface AiCommentsApiClient {
  addComment(input: QueueAiCommentInput): Promise<QueuedAiComment>;
}

interface AiCommentsApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createAiCommentsApiClientConfig(
  options: AiCommentsApiClientOptions = {},
): AiCommentsApiClientConfig {
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
      // Keep the fallback error when the response body is not valid JSON.
    }

    throw new Error(detail);
  }

  return response;
}

export function createAiCommentsApiClient(
  options: AiCommentsApiClientOptions = {},
): AiCommentsApiClient {
  const config = createAiCommentsApiClientConfig(options);

  return {
    async addComment(input: QueueAiCommentInput): Promise<QueuedAiComment> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ai-comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await ensureOk(response, "AI comment queue error");
      const payload = (await response.json()) as {
        comment: QueuedAiComment;
      };
      return payload.comment;
    },
  };
}

import { type GitOperationPhase } from "./git-actions";
import { resolveFetchImplementation } from "./fetch";

export type ProcessWorkerStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ProcessWorkerSource = "git" | "codex-agent" | "claude-code-agent";

export type ProcessWorkerChannel = "stdout" | "stderr" | "system";

export interface ProcessWorkerCommandSummary {
  readonly id: string;
  readonly commandText: string;
  readonly cwd: string;
  readonly status: ProcessWorkerStatus;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly exitCode?: number | undefined;
}

export interface ProcessWorkerLogChunk {
  readonly id: number;
  readonly channel: ProcessWorkerChannel;
  readonly text: string;
  readonly timestamp: string;
  readonly commandId?: string | undefined;
}

export interface ProcessWorkerSummary {
  readonly id: string;
  readonly title: string;
  readonly projectPath: string;
  readonly phase: GitOperationPhase;
  readonly source: ProcessWorkerSource;
  readonly status: ProcessWorkerStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | undefined;
  readonly error?: string | undefined;
  readonly commandSummary: string;
  readonly outputPreview: string;
  readonly canCancel: boolean;
}

export interface ProcessWorkerDetail extends ProcessWorkerSummary {
  readonly commands: readonly ProcessWorkerCommandSummary[];
  readonly logs: readonly ProcessWorkerLogChunk[];
}

export interface CancelProcessWorkerResult {
  readonly success: boolean;
  readonly workerId: string;
  readonly cancelled: boolean;
}

export interface WorkersApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface WorkersApiClient {
  listWorkers(
    projectPath?: string | undefined,
  ): Promise<readonly ProcessWorkerSummary[]>;
  fetchWorker(workerId: string): Promise<ProcessWorkerDetail>;
  cancelWorker(workerId: string): Promise<CancelProcessWorkerResult>;
}

interface WorkersApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createWorkersApiClientConfig(
  options: WorkersApiClientOptions = {},
): WorkersApiClientConfig {
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

export function createWorkersApiClient(
  options: WorkersApiClientOptions = {},
): WorkersApiClient {
  const config = createWorkersApiClientConfig(options);

  return {
    async listWorkers(
      projectPath?: string | undefined,
    ): Promise<readonly ProcessWorkerSummary[]> {
      const searchParams = new URLSearchParams();
      if (typeof projectPath === "string" && projectPath.trim().length > 0) {
        searchParams.set("projectPath", projectPath.trim());
      }
      const query = searchParams.toString();
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/workers${query.length > 0 ? `?${query}` : ""}`,
      );
      await ensureOk(response, "Failed to fetch workers");
      const payload = (await response.json()) as {
        readonly workers: readonly ProcessWorkerSummary[];
      };
      return payload.workers;
    },
    async fetchWorker(workerId: string): Promise<ProcessWorkerDetail> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/workers/${encodeURIComponent(workerId)}`,
      );
      await ensureOk(response, "Failed to fetch worker details");
      const payload = (await response.json()) as {
        readonly worker: ProcessWorkerDetail;
      };
      return payload.worker;
    },
    async cancelWorker(workerId: string): Promise<CancelProcessWorkerResult> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/workers/${encodeURIComponent(workerId)}/cancel`,
        {
          method: "POST",
        },
      );
      await ensureOk(response, "Failed to cancel worker");
      return (await response.json()) as CancelProcessWorkerResult;
    },
  };
}

import { resolveFetchImplementation } from "./fetch";

export type GitOperationPhase =
  | "idle"
  | "committing"
  | "pushing"
  | "pulling"
  | "creating-pr"
  | "initializing";

export type GitActionName = "commit" | "push" | "pull" | "pr" | "init";

export interface GitActionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string | undefined;
}

export interface PullRequestStatus {
  readonly hasPR: boolean;
  readonly pr: {
    readonly url: string;
    readonly number: number;
    readonly state: string;
    readonly title: string;
  } | null;
  readonly canCreatePR: boolean;
  readonly baseBranch: string;
  readonly availableBaseBranches: readonly string[];
  readonly reason?: string | undefined;
}

export interface GitOperationStatus {
  readonly operating: boolean;
  readonly phase: GitOperationPhase;
  readonly workerId?: string | undefined;
}

export interface CancelGitActionResult {
  readonly success: boolean;
  readonly actionId: string;
  readonly cancelled: boolean;
}

export interface GitActionsApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface GitActionsApiClient {
  fetchOperationStatus(): Promise<GitOperationStatus>;
  fetchPullRequestStatus(projectPath: string): Promise<PullRequestStatus>;
  commit(input: {
    readonly projectPath: string;
    readonly actionId?: string | undefined;
    readonly customCtx?: string | undefined;
    readonly modelProfileId?: string | undefined;
  }): Promise<GitActionResult>;
  push(
    projectPath: string,
    actionId?: string | undefined,
  ): Promise<GitActionResult>;
  pull(
    projectPath: string,
    actionId?: string | undefined,
  ): Promise<GitActionResult>;
  init(
    projectPath: string,
    actionId?: string | undefined,
  ): Promise<GitActionResult>;
  createPullRequest(input: {
    readonly projectPath: string;
    readonly baseBranch: string;
    readonly actionId?: string | undefined;
    readonly customCtx?: string | undefined;
    readonly modelProfileId?: string | undefined;
  }): Promise<GitActionResult>;
  updatePullRequest(input: {
    readonly projectPath: string;
    readonly baseBranch: string;
    readonly actionId?: string | undefined;
    readonly customCtx?: string | undefined;
    readonly modelProfileId?: string | undefined;
  }): Promise<GitActionResult>;
  cancel(actionId: string): Promise<CancelGitActionResult>;
}

interface GitActionsApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createGitActionsApiClientConfig(
  options: GitActionsApiClientOptions = {},
): GitActionsApiClientConfig {
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

async function postGitAction(
  endpointPath: string,
  body: object,
  config: GitActionsApiClientConfig,
  failureMessage: string,
): Promise<GitActionResult> {
  const response = await config.fetchImplementation(
    `${config.apiBaseUrl}/git-actions/${endpointPath}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  await ensureOk(response, failureMessage);
  return (await response.json()) as GitActionResult;
}

export function createGitActionsApiClient(
  options: GitActionsApiClientOptions = {},
): GitActionsApiClient {
  const config = createGitActionsApiClientConfig(options);

  return {
    async fetchOperationStatus(): Promise<GitOperationStatus> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/git-actions/operating`,
      );
      await ensureOk(response, "Failed to fetch git operation status");
      return (await response.json()) as GitOperationStatus;
    },
    async fetchPullRequestStatus(projectPath): Promise<PullRequestStatus> {
      const searchParams = new URLSearchParams({
        projectPath,
      });
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/git-actions/pr-status?${searchParams.toString()}`,
      );
      await ensureOk(response, "Failed to fetch pull request status");
      const payload = (await response.json()) as {
        readonly status: PullRequestStatus;
      };
      return payload.status;
    },
    commit: (input) =>
      postGitAction(
        "commit",
        input,
        config,
        "Failed to execute git commit action",
      ),
    push: (projectPath, actionId) =>
      postGitAction(
        "push",
        { projectPath, actionId },
        config,
        "Failed to execute git push action",
      ),
    pull: (projectPath, actionId) =>
      postGitAction(
        "pull",
        { projectPath, actionId },
        config,
        "Failed to execute git pull action",
      ),
    init: (projectPath, actionId) =>
      postGitAction(
        "init",
        { projectPath, actionId },
        config,
        "Failed to initialize git repository",
      ),
    createPullRequest: (input) =>
      postGitAction(
        "create-pr",
        input,
        config,
        "Failed to create pull request",
      ),
    updatePullRequest: (input) =>
      postGitAction(
        "update-pr",
        input,
        config,
        "Failed to update pull request",
      ),
    async cancel(actionId): Promise<CancelGitActionResult> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/git-actions/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId }),
        },
      );
      await ensureOk(response, "Failed to cancel git action");
      return (await response.json()) as CancelGitActionResult;
    },
  };
}

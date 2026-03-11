import {
  createWorkspaceShellState,
  normalizeWorkspaceSnapshot,
  type WorkspaceTabSummary,
  type RecentProjectSummary,
  type WorkspaceApiResponse,
  type WorkspaceShellState,
  type WorkspaceSnapshot,
} from "../contracts/workspace";
import { resolveFetchImplementation } from "./fetch";

export interface WorkspaceApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface WorkspaceApiClient {
  fetchWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
  fetchRecentProjects(): Promise<readonly RecentProjectSummary[]>;
  fetchWorkspaceShellState(): Promise<WorkspaceShellState>;
  activateWorkspaceTab(tabId: string): Promise<WorkspaceSnapshot>;
  closeWorkspaceTab(tabId: string): Promise<WorkspaceSnapshot>;
  pickDirectory(startPath?: string): Promise<string | null>;
  openWorkspaceTab(path: string): Promise<{
    readonly tab: WorkspaceTabSummary;
    readonly workspaceSnapshot: WorkspaceSnapshot;
  }>;
  openWorkspaceTabBySlug(slug: string): Promise<{
    readonly tab: WorkspaceTabSummary;
    readonly workspaceSnapshot: WorkspaceSnapshot;
  }>;
  removeRecentProject(path: string): Promise<void>;
}

export interface RecentProjectsApiResponse {
  readonly recent?: readonly RecentProjectSummary[] | undefined;
}

interface WorkspaceMutationResponse {
  readonly workspace: WorkspaceApiResponse["workspace"];
  readonly metadata?: WorkspaceApiResponse["metadata"];
}

interface OpenWorkspaceTabResponse extends WorkspaceMutationResponse {
  readonly tab: WorkspaceTabSummary;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

interface WorkspaceApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
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
      // Keep the status-based fallback when the response is not JSON.
    }

    throw new Error(detail);
  }
  return response;
}

function normalizeWorkspaceMutation(
  response: WorkspaceMutationResponse,
): WorkspaceSnapshot {
  return normalizeWorkspaceSnapshot({
    workspace: response.workspace,
    ...(response.metadata !== undefined
      ? {
          metadata: response.metadata,
        }
      : {}),
  });
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function buildWorkspaceApiUrl(
  config: WorkspaceApiClientConfig,
  path: string,
): string {
  return `${config.apiBaseUrl}${path}`;
}

function createWorkspaceApiClientConfig(
  options: WorkspaceApiClientOptions = {},
): WorkspaceApiClientConfig {
  return {
    fetchImplementation: resolveFetchImplementation(
      options.fetchImplementation,
    ),
    apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl ?? "/api"),
  };
}

async function fetchWorkspaceSnapshotWithConfig(
  config: WorkspaceApiClientConfig,
): Promise<WorkspaceSnapshot> {
  const workspaceResponse = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, "/workspace"),
  );
  await ensureOk(workspaceResponse, "Failed to fetch workspace");
  const workspacePayload =
    (await workspaceResponse.json()) as WorkspaceApiResponse;
  return normalizeWorkspaceSnapshot(workspacePayload);
}

async function fetchRecentProjectsWithConfig(
  config: WorkspaceApiClientConfig,
): Promise<readonly RecentProjectSummary[]> {
  const recentProjectsResponse = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, "/workspace/recent"),
  );
  await ensureOk(recentProjectsResponse, "Failed to fetch recent projects");
  const recentProjectsPayload =
    (await recentProjectsResponse.json()) as RecentProjectsApiResponse;
  return recentProjectsPayload.recent ?? [];
}

async function activateWorkspaceTabWithConfig(
  tabId: string,
  config: WorkspaceApiClientConfig,
): Promise<WorkspaceSnapshot> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, `/workspace/tabs/${tabId}/activate`),
    {
      method: "POST",
    },
  );
  await ensureOk(response, "Failed to activate workspace tab");
  const payload = (await response.json()) as WorkspaceMutationResponse;
  return normalizeWorkspaceMutation(payload);
}

async function closeWorkspaceTabWithConfig(
  tabId: string,
  config: WorkspaceApiClientConfig,
): Promise<WorkspaceSnapshot> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, `/workspace/tabs/${tabId}`),
    {
      method: "DELETE",
    },
  );
  await ensureOk(response, "Failed to close workspace tab");
  const payload = (await response.json()) as WorkspaceMutationResponse;
  return normalizeWorkspaceMutation(payload);
}

async function pickDirectoryWithConfig(
  startPath: string | undefined,
  config: WorkspaceApiClientConfig,
): Promise<string | null> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, "/browse/pick-directory"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startPath === undefined ? {} : { startPath }),
    },
  );
  await ensureOk(response, "Failed to open directory picker");
  const payload = (await response.json()) as { path?: string | null };
  return payload.path ?? null;
}

async function openWorkspaceTabWithConfig(
  path: string,
  config: WorkspaceApiClientConfig,
): Promise<{
  readonly tab: WorkspaceTabSummary;
  readonly workspaceSnapshot: WorkspaceSnapshot;
}> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, "/workspace/tabs"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
  );
  await ensureOk(response, "Failed to open workspace tab");
  const payload = (await response.json()) as OpenWorkspaceTabResponse;
  return {
    tab: payload.tab,
    workspaceSnapshot: normalizeWorkspaceMutation(payload),
  };
}

async function openWorkspaceTabBySlugWithConfig(
  slug: string,
  config: WorkspaceApiClientConfig,
): Promise<{
  readonly tab: WorkspaceTabSummary;
  readonly workspaceSnapshot: WorkspaceSnapshot;
}> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(
      config,
      `/workspace/tabs/by-slug/${encodeURIComponent(slug)}`,
    ),
    {
      method: "POST",
    },
  );
  await ensureOk(response, "Failed to open workspace tab by slug");
  const payload = (await response.json()) as OpenWorkspaceTabResponse;
  return {
    tab: payload.tab,
    workspaceSnapshot: normalizeWorkspaceMutation(payload),
  };
}

async function removeRecentProjectWithConfig(
  path: string,
  config: WorkspaceApiClientConfig,
): Promise<void> {
  const response = await config.fetchImplementation(
    buildWorkspaceApiUrl(config, "/workspace/recent"),
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
  );
  await ensureOk(response, "Failed to remove recent project");
}

export function createWorkspaceApiClient(
  options: WorkspaceApiClientOptions = {},
): WorkspaceApiClient {
  const config = createWorkspaceApiClientConfig(options);

  return {
    fetchWorkspaceSnapshot: () => fetchWorkspaceSnapshotWithConfig(config),
    fetchRecentProjects: () => fetchRecentProjectsWithConfig(config),
    fetchWorkspaceShellState: async () => {
      const [workspaceSnapshot, recentProjects] = await Promise.all([
        fetchWorkspaceSnapshotWithConfig(config),
        fetchRecentProjectsWithConfig(config),
      ]);

      return createWorkspaceShellState(workspaceSnapshot, recentProjects);
    },
    activateWorkspaceTab: (tabId: string) =>
      activateWorkspaceTabWithConfig(tabId, config),
    closeWorkspaceTab: (tabId: string) =>
      closeWorkspaceTabWithConfig(tabId, config),
    pickDirectory: (startPath?: string) =>
      pickDirectoryWithConfig(startPath, config),
    openWorkspaceTab: (path: string) =>
      openWorkspaceTabWithConfig(path, config),
    openWorkspaceTabBySlug: (slug: string) =>
      openWorkspaceTabBySlugWithConfig(slug, config),
    removeRecentProject: (path: string) =>
      removeRecentProjectWithConfig(path, config),
  };
}

export async function fetchWorkspaceSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<WorkspaceSnapshot> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).fetchWorkspaceSnapshot();
}

export async function fetchRecentProjects(
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly RecentProjectSummary[]> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).fetchRecentProjects();
}

export async function fetchWorkspaceShellState(
  fetchImplementation: typeof fetch = fetch,
): Promise<WorkspaceShellState> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).fetchWorkspaceShellState();
}

export async function activateWorkspaceTab(
  tabId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<WorkspaceSnapshot> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).activateWorkspaceTab(tabId);
}

export async function closeWorkspaceTab(
  tabId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<WorkspaceSnapshot> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).closeWorkspaceTab(tabId);
}

export async function openWorkspaceTab(
  path: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{
  readonly tab: WorkspaceTabSummary;
  readonly workspaceSnapshot: WorkspaceSnapshot;
}> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).openWorkspaceTab(path);
}

export async function pickDirectory(
  startPath?: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<string | null> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).pickDirectory(startPath);
}

export async function openWorkspaceTabBySlug(
  slug: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{
  readonly tab: WorkspaceTabSummary;
  readonly workspaceSnapshot: WorkspaceSnapshot;
}> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).openWorkspaceTabBySlug(slug);
}

export async function removeRecentProject(
  path: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  return createWorkspaceApiClient({
    fetchImplementation,
  }).removeRecentProject(path);
}

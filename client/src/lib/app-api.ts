import type { DiffFile } from "../types/diff";
import type {
  QraftAiSessionId,
  FileReference,
  AISessionSubmitResult,
} from "../../../src/types/ai";
import { AIAgent } from "../../../src/types/ai-agent";
import type {
  ModelConfigState,
  OperationLanguageSettings,
  ModelProfile,
  ModelVendor,
  OperationModelBindings,
} from "../../../src/types/model-config";
import type { PromptTemplate, PromptCategory } from "../../../src/types/prompt-config";
import type { ServerFileNode } from "./file-tree-utils";

export type ServerTab = {
  id: string;
  path: string;
  name: string;
  isGitRepo: boolean;
  projectSlug: string;
};

export type RecentProject = {
  path: string;
  name: string;
  isGitRepo: boolean;
};

export type FileContentResponse = {
  path: string;
  content: string;
  language: string;
  isBinary?: boolean;
  isImage?: boolean;
  isVideo?: boolean;
  isPdf?: boolean;
  mimeType?: string;
};

export type FileAutocompleteResult = {
  path: string;
  status?: string | undefined;
};

export function buildRawFileUrl(ctxId: string, filePath: string): string {
  return `/api/ctx/${ctxId}/files/file-raw/${filePath}`;
}

export type PromptQueueItem = {
  id: string;
  message: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  claude_session_id?: string | undefined;
  current_activity?: string | undefined;
  error?: string | undefined;
  created_at: string;
  worktree_id: string;
  qraft_ai_session_id?: QraftAiSessionId | undefined;
  ai_agent?: AIAgent | undefined;
};

export type GitActionPromptName =
  | "commit"
  | "create-pr"
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

export type EffectivePromptResponse = {
  name: GitActionPromptName;
  path: string;
  content: string;
  source: "file" | "fallback";
};

export type AISessionInfo = {
  id: string;
  state: string;
  prompt: string;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  context: unknown;
  lastAssistantMessage?: string | undefined;
  currentActivity?: string | undefined;
  clientSessionId?: QraftAiSessionId | undefined;
  aiAgent?: AIAgent | undefined;
};

function ensureOk(response: Response, message: string): Response {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status}`);
  }
  return response;
}

export async function fetchWorkspace(): Promise<{
  tabs: ServerTab[];
  activeTabId: string | null;
}> {
  const response = await fetch("/api/workspace");
  ensureOk(response, "Failed to fetch workspace");
  const data = (await response.json()) as {
    workspace: {
      tabs?: ServerTab[];
      activeTabId?: string | null;
    };
  };
  return {
    tabs: data.workspace.tabs ?? [],
    activeTabId: data.workspace.activeTabId ?? null,
  };
}

export async function activateWorkspaceTab(tabId: string): Promise<void> {
  const response = await fetch(`/api/workspace/tabs/${tabId}/activate`, {
    method: "POST",
  });
  ensureOk(response, "Failed to activate tab");
}

export async function closeWorkspaceTab(tabId: string): Promise<{
  tabs: ServerTab[];
  activeTabId: string | null;
}> {
  const response = await fetch(`/api/workspace/tabs/${tabId}`, {
    method: "DELETE",
  });
  ensureOk(response, "Failed to close tab");
  const data = (await response.json()) as {
    workspace: {
      tabs: ServerTab[];
      activeTabId: string | null;
    };
  };
  return {
    tabs: data.workspace.tabs,
    activeTabId: data.workspace.activeTabId,
  };
}

export async function createWorkspaceTab(path: string): Promise<{
  tab: ServerTab;
  tabs: ServerTab[];
}> {
  const response = await fetch("/api/workspace/tabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const errData = (await response.json()) as { error?: string };
    throw new Error(errData.error ?? `Failed to open (${response.status})`);
  }

  const data = (await response.json()) as {
    tab: ServerTab;
    workspace: { tabs: ServerTab[] };
  };

  return { tab: data.tab, tabs: data.workspace.tabs };
}

export async function fetchRecentWorkspaceProjects(): Promise<RecentProject[]> {
  const response = await fetch("/api/workspace/recent");
  ensureOk(response, "Failed to fetch recent projects");
  const data = (await response.json()) as {
    recent: RecentProject[];
  };
  return data.recent;
}

export async function removeRecentWorkspaceProject(
  path: string,
): Promise<void> {
  await fetch("/api/workspace/recent", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function pickDirectoryViaServer(
  startPath?: string,
): Promise<string | null> {
  const response = await fetch("/api/browse/pick-directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startPath }),
  });

  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to open directory picker");
  }

  const data = (await response.json()) as { path: string | null };
  return data.path;
}

export async function fetchDiffFiles(ctxId: string): Promise<DiffFile[]> {
  const response = await fetch(`/api/ctx/${ctxId}/diff`);
  ensureOk(response, "Diff API error");
  const data = (await response.json()) as { files: DiffFile[] };
  return data.files;
}

export async function fetchAllFilesTreeApi(
  ctxId: string,
  shallow: boolean,
  options?: { showIgnored?: boolean; showAllFiles?: boolean } | undefined,
): Promise<ServerFileNode> {
  const params = new URLSearchParams({ mode: "all" });
  if (shallow) {
    params.set("shallow", "true");
  }
  if (options?.showIgnored === true) {
    params.set("showIgnored", "true");
  }
  if (options?.showAllFiles === true) {
    params.set("showAllFiles", "true");
  }
  const response = await fetch(`/api/ctx/${ctxId}/files?${params.toString()}`);
  ensureOk(response, "Files API error");
  const data = (await response.json()) as { tree: ServerFileNode };
  return data.tree;
}

export async function fetchDirectoryChildrenApi(
  ctxId: string,
  dirPath: string,
  options?: { showIgnored?: boolean; showAllFiles?: boolean } | undefined,
): Promise<ServerFileNode[]> {
  const params = new URLSearchParams({ path: dirPath });
  if (options?.showIgnored === true) {
    params.set("showIgnored", "true");
  }
  if (options?.showAllFiles === true) {
    params.set("showAllFiles", "true");
  }
  const response = await fetch(
    `/api/ctx/${ctxId}/files/children?${params.toString()}`,
  );
  ensureOk(response, "Children API error");
  const data = (await response.json()) as { children: ServerFileNode[] };
  return data.children;
}

export async function fetchFileContentApi(
  ctxId: string,
  filePath: string,
): Promise<FileContentResponse> {
  const response = await fetch(`/api/ctx/${ctxId}/files/file/${filePath}`);
  ensureOk(response, "File API error");
  return (await response.json()) as FileContentResponse;
}

export async function fetchFileAutocompleteApi(
  ctxId: string,
  query: string,
  limit = 50,
): Promise<readonly FileAutocompleteResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const response = await fetch(
    `/api/ctx/${ctxId}/files/autocomplete?${params.toString()}`,
  );
  ensureOk(response, "File autocomplete API error");
  const data = (await response.json()) as {
    results: readonly FileAutocompleteResult[];
  };
  return data.results;
}

export async function submitAIPrompt(params: {
  runImmediately: boolean;
  message: string;
  projectPath: string;
  qraftAiSessionId: QraftAiSessionId;
  aiAgent?: AIAgent | undefined;
  modelProfileId?: string | undefined;
  context: {
    primaryFile:
      | {
          path: string;
          startLine: number;
          endLine: number;
          content: string;
        }
      | undefined;
    references: readonly FileReference[];
    diffSummary: string | undefined;
  };
}): Promise<AISessionSubmitResult> {
  const response = await fetch("/api/ai/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_immediately: params.runImmediately,
      message: params.message,
      context: params.context,
      project_path: params.projectPath,
      qraft_ai_session_id: params.qraftAiSessionId,
      ai_agent: params.aiAgent,
      model_profile_id: params.modelProfileId,
    }),
  });

  ensureOk(response, "AI submit error");
  return (await response.json()) as AISessionSubmitResult;
}

export async function fetchModelConfigState(): Promise<ModelConfigState> {
  const response = await fetch("/api/model-config");
  ensureOk(response, "Model config API error");
  return (await response.json()) as ModelConfigState;
}

export async function createModelProfileApi(input: {
  name: string;
  vendor: ModelVendor;
  model: string;
  arguments: readonly string[];
}): Promise<ModelProfile> {
  const response = await fetch("/api/model-config/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  ensureOk(response, "Failed to create model profile");
  const data = (await response.json()) as { profile: ModelProfile };
  return data.profile;
}

export async function updateModelProfileApi(
  profileId: string,
  input: {
    name?: string;
    vendor?: ModelVendor;
    model?: string;
    arguments?: readonly string[];
  },
): Promise<ModelProfile> {
  const response = await fetch(`/api/model-config/profiles/${profileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  ensureOk(response, "Failed to update model profile");
  const data = (await response.json()) as { profile: ModelProfile };
  return data.profile;
}

export async function deleteModelProfileApi(profileId: string): Promise<void> {
  const response = await fetch(`/api/model-config/profiles/${profileId}`, {
    method: "DELETE",
  });
  ensureOk(response, "Failed to delete model profile");
}

export async function updateModelBindingsApi(
  bindings: Partial<OperationModelBindings>,
): Promise<OperationModelBindings> {
  const response = await fetch("/api/model-config/bindings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bindings),
  });
  ensureOk(response, "Failed to update model bindings");
  const data = (await response.json()) as {
    operationBindings: OperationModelBindings;
  };
  return data.operationBindings;
}

export async function updateModelLanguagesApi(
  operationLanguages: Partial<OperationLanguageSettings>,
): Promise<OperationLanguageSettings> {
  const response = await fetch("/api/model-config/languages", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operationLanguages),
  });
  ensureOk(response, "Failed to update operation languages");
  const data = (await response.json()) as {
    operationLanguages: OperationLanguageSettings;
  };
  return data.operationLanguages;
}

export async function fetchPromptTemplatesApi(
  contextId: string,
  category?: PromptCategory | undefined,
): Promise<readonly PromptTemplate[]> {
  const params = new URLSearchParams();
  if (category !== undefined) {
    params.set("category", category);
  }
  const query = params.toString();
  const base = `/api/ctx/${contextId}/prompts`;
  const url = query.length > 0 ? `${base}?${query}` : base;
  const response = await fetch(url);
  ensureOk(response, "Failed to fetch prompt templates");
  const data = (await response.json()) as { prompts: readonly PromptTemplate[] };
  return data.prompts;
}

export async function fetchDefaultPromptIdApi(
  contextId: string,
  category: PromptCategory,
): Promise<string | null> {
  const response = await fetch(`/api/ctx/${contextId}/prompts/default/${category}`);
  ensureOk(response, "Failed to fetch default prompt");
  const data = (await response.json()) as { defaultId: string | null };
  return data.defaultId;
}

export async function updateDefaultPromptIdApi(
  contextId: string,
  category: PromptCategory,
  id: string,
): Promise<void> {
  const response = await fetch(`/api/ctx/${contextId}/prompts/default/${category}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  ensureOk(response, "Failed to update default prompt");
}

export async function fetchGitActionPromptApi(
  name: GitActionPromptName,
): Promise<EffectivePromptResponse> {
  const response = await fetch(`/api/git-actions/prompts/${name}`);
  ensureOk(response, "Failed to fetch action prompt");
  return (await response.json()) as EffectivePromptResponse;
}

export async function updateGitActionPromptApi(
  name: GitActionPromptName,
  content: string,
): Promise<EffectivePromptResponse> {
  const response = await fetch(`/api/git-actions/prompts/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  ensureOk(response, "Failed to update action prompt");
  return (await response.json()) as EffectivePromptResponse;
}

export async function fetchPromptQueueApi(): Promise<PromptQueueItem[]> {
  const response = await fetch("/api/ai/prompt-queue");
  ensureOk(response, "Prompt queue error");
  const data = (await response.json()) as { prompts: PromptQueueItem[] };
  return data.prompts;
}

export async function fetchAISessionsApi(): Promise<AISessionInfo[]> {
  const response = await fetch("/api/ai/sessions");
  ensureOk(response, "AI sessions error");
  const data = (await response.json()) as { sessions: AISessionInfo[] };
  return data.sessions;
}

export async function fetchHiddenAISessionIdsApi(): Promise<readonly string[]> {
  const response = await fetch("/api/ai/sessions/hidden");
  ensureOk(response, "Hidden AI sessions error");
  const data = (await response.json()) as { sessionIds: string[] };
  return data.sessionIds;
}

export async function setAISessionHiddenApi(
  sessionId: string,
  hidden: boolean,
): Promise<void> {
  const response = await fetch(`/api/ai/sessions/${sessionId}/hidden`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden }),
  });
  ensureOk(response, "Failed to update hidden state");
}

export async function cancelAISessionApi(sessionId: string): Promise<void> {
  const response = await fetch(`/api/ai/sessions/${sessionId}/cancel`, {
    method: "POST",
  });
  ensureOk(response, "Failed to cancel session");
}

export async function cancelQueuedPromptApi(promptId: string): Promise<void> {
  const response = await fetch(`/api/ai/prompt-queue/${promptId}/cancel`, {
    method: "POST",
  });
  ensureOk(response, "Failed to cancel queued prompt");
}

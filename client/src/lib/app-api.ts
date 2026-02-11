import type { DiffFile } from "../types/diff";
import type { QraftAiSessionId, FileReference } from "../../../src/types/ai";
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
  mimeType?: string;
};

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
};

export type AISessionInfo = {
  id: string;
  state: string;
  prompt: string;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  context: unknown;
  currentActivity?: string | undefined;
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

export async function removeRecentWorkspaceProject(path: string): Promise<void> {
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
): Promise<ServerFileNode> {
  const query = shallow ? "?mode=all&shallow=true" : "?mode=all";
  const response = await fetch(`/api/ctx/${ctxId}/files${query}`);
  ensureOk(response, "Files API error");
  const data = (await response.json()) as { tree: ServerFileNode };
  return data.tree;
}

export async function fetchDirectoryChildrenApi(
  ctxId: string,
  dirPath: string,
): Promise<ServerFileNode[]> {
  const response = await fetch(
    `/api/ctx/${ctxId}/files/children?path=${encodeURIComponent(dirPath)}`,
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

export async function submitAIPrompt(params: {
  runImmediately: boolean;
  message: string;
  projectPath: string;
  qraftAiSessionId: QraftAiSessionId;
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
}): Promise<void> {
  const response = await fetch("/api/ai/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_immediately: params.runImmediately,
      message: params.message,
      context: params.context,
      project_path: params.projectPath,
      qraft_ai_session_id: params.qraftAiSessionId,
    }),
  });

  ensureOk(response, "AI submit error");
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

export async function cancelAISessionApi(sessionId: string): Promise<void> {
  const response = await fetch(`/api/ai/sessions/${sessionId}/cancel`, {
    method: "POST",
  });
  ensureOk(response, "Failed to cancel session");
}

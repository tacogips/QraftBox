import {
  convertServerFileTree,
  type FileContent,
  type FileTreeNode,
  type ServerFileNode,
} from "../contracts/files";
import { resolveFetchImplementation } from "./fetch";

export interface FilesApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface FilesApiClient {
  fetchAllFilesTree(
    contextId: string,
    shallow: boolean,
    options?: {
      readonly showIgnored?: boolean | undefined;
      readonly showAllFiles?: boolean | undefined;
    },
  ): Promise<{
    readonly tree: FileTreeNode;
    readonly totalFiles: number;
    readonly changedFiles: number;
  }>;
  fetchDirectoryChildren(
    contextId: string,
    directoryPath: string,
    options?: {
      readonly showIgnored?: boolean | undefined;
      readonly showAllFiles?: boolean | undefined;
    },
  ): Promise<readonly FileTreeNode[]>;
  fetchFileContent(contextId: string, filePath: string): Promise<FileContent>;
}

interface FilesApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createFilesApiClientConfig(
  options: FilesApiClientOptions = {},
): FilesApiClientConfig {
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

function createFilesQuery(
  initialEntries: Readonly<Record<string, string>>,
  options?: {
    readonly showIgnored?: boolean | undefined;
    readonly showAllFiles?: boolean | undefined;
  },
): string {
  const searchParams = new URLSearchParams(initialEntries);
  if (options?.showIgnored === true) {
    searchParams.set("showIgnored", "true");
  }
  if (options?.showAllFiles === true) {
    searchParams.set("showAllFiles", "true");
  }
  return searchParams.toString();
}

async function fetchAllFilesTreeWithConfig(
  contextId: string,
  shallow: boolean,
  options: {
    readonly showIgnored?: boolean | undefined;
    readonly showAllFiles?: boolean | undefined;
  },
  config: FilesApiClientConfig,
): Promise<{
  readonly tree: FileTreeNode;
  readonly totalFiles: number;
  readonly changedFiles: number;
}> {
  const treeResponse = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/files?${createFilesQuery(
      {
        mode: "all",
        ...(shallow ? { shallow: "true" } : {}),
      },
      options,
    )}`,
  );
  await ensureOk(treeResponse, "Failed to fetch file tree");
  const treePayload = (await treeResponse.json()) as {
    readonly tree: ServerFileNode;
    readonly totalFiles?: number | undefined;
    readonly changedFiles?: number | undefined;
  };

  return {
    tree: convertServerFileTree(treePayload.tree),
    totalFiles: treePayload.totalFiles ?? 0,
    changedFiles: treePayload.changedFiles ?? 0,
  };
}

async function fetchDirectoryChildrenWithConfig(
  contextId: string,
  directoryPath: string,
  options: {
    readonly showIgnored?: boolean | undefined;
    readonly showAllFiles?: boolean | undefined;
  },
  config: FilesApiClientConfig,
): Promise<readonly FileTreeNode[]> {
  const childrenResponse = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(contextId)}/files/children?${createFilesQuery(
      {
        path: directoryPath,
      },
      options,
    )}`,
  );
  await ensureOk(childrenResponse, "Failed to fetch directory children");
  const childrenPayload = (await childrenResponse.json()) as {
    readonly children: readonly ServerFileNode[];
  };

  return childrenPayload.children.map(convertServerFileTree);
}

async function fetchFileContentWithConfig(
  contextId: string,
  filePath: string,
  config: FilesApiClientConfig,
): Promise<FileContent> {
  const fileContentResponse = await config.fetchImplementation(
    `${config.apiBaseUrl}/ctx/${encodeURIComponent(
      contextId,
    )}/files/file/${filePath}`,
  );
  await ensureOk(fileContentResponse, "Failed to fetch file content");
  return (await fileContentResponse.json()) as FileContent;
}

export function createFilesApiClient(
  options: FilesApiClientOptions = {},
): FilesApiClient {
  const config = createFilesApiClientConfig(options);

  return {
    fetchAllFilesTree: (contextId, shallow, fetchOptions) =>
      fetchAllFilesTreeWithConfig(
        contextId,
        shallow,
        fetchOptions ?? {},
        config,
      ),
    fetchDirectoryChildren: (contextId, directoryPath, fetchOptions) =>
      fetchDirectoryChildrenWithConfig(
        contextId,
        directoryPath,
        fetchOptions ?? {},
        config,
      ),
    fetchFileContent: (contextId, filePath) =>
      fetchFileContentWithConfig(contextId, filePath, config),
  };
}

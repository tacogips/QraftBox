import type { FileChangeEvent } from "../../../src/types/watcher";

export interface FileChangeMessage {
  readonly changes: readonly FileChangeEvent[];
  readonly projectPath?: string | undefined;
}

export interface FileChangeHandler {
  handleFileChange(message: FileChangeMessage): void;
  dispose(): void;
}

export interface CreateFileChangeHandlerOptions {
  readonly debounceMs?: number | undefined;
  getContextId(): string | null;
  getProjectPath(): string;
  getSelectedPath(): string | null;
  markStale(): void;
  refreshContext(contextId: string): Promise<void> | void;
  refreshSelectedPath?:
    | ((contextId: string, selectedPath: string) => Promise<void> | void)
    | undefined;
}

function isCurrentProjectEvent(
  message: FileChangeMessage,
  activeProjectPath: string,
): boolean {
  return (
    message.projectPath === undefined || message.projectPath === activeProjectPath
  );
}

export function createFileChangeHandler(
  options: CreateFileChangeHandlerOptions,
): FileChangeHandler {
  const debounceMs = options.debounceMs ?? 500;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    handleFileChange(message: FileChangeMessage): void {
      const activeContextId = options.getContextId();
      if (activeContextId === null) {
        return;
      }

      const activeProjectPath = options.getProjectPath();
      const selectedPath = options.getSelectedPath();
      const currentProjectEvent = isCurrentProjectEvent(
        message,
        activeProjectPath,
      );
      if (!currentProjectEvent) {
        return;
      }

      options.markStale();
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        const refreshedContextId = options.getContextId();
        if (refreshedContextId !== null) {
          void options.refreshContext(refreshedContextId);
        }
        refreshTimer = null;
      }, debounceMs);

      if (
        selectedPath !== null &&
        options.refreshSelectedPath !== undefined &&
        message.changes.some((change) => change.path === selectedPath)
      ) {
        void options.refreshSelectedPath(activeContextId, selectedPath);
      }
    },
    dispose(): void {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}

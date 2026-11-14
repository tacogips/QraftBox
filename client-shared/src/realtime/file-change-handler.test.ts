import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  createFileChangeHandler,
  type FileChangeMessage,
} from "./file-change-handler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createFileChangeMessage(
  overrides: Partial<FileChangeMessage> = {},
): FileChangeMessage {
  return {
    projectPath: "/repo/active",
    changes: [{ type: "modify", path: "src/main.ts", timestamp: 1 }],
    ...overrides,
  };
}

describe("createFileChangeHandler", () => {
  afterEach(() => {
    mock.restore();
  });

  test("debounces context refresh and reloads the selected file for the active project", async () => {
    const markStale = mock(() => {});
    const refreshContext = mock(async () => {});
    const refreshSelectedPath = mock(async () => {});
    const fileChangeHandler = createFileChangeHandler({
      debounceMs: 20,
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => "src/main.ts",
      markStale,
      refreshContext,
      refreshSelectedPath,
    });

    fileChangeHandler.handleFileChange(createFileChangeMessage());

    expect(markStale).toHaveBeenCalledTimes(1);
    expect(refreshSelectedPath).toHaveBeenCalledWith("ctx-1", "src/main.ts");
    expect(refreshContext).not.toHaveBeenCalled();

    await wait(30);

    expect(refreshContext).toHaveBeenCalledWith("ctx-1");
  });

  test("does not reload the selected file when the event belongs to another project", async () => {
    const markStale = mock(() => {});
    const refreshSelectedPath = mock(async () => {});
    const refreshContext = mock(async () => {});
    const fileChangeHandler = createFileChangeHandler({
      debounceMs: 20,
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => "src/main.ts",
      markStale,
      refreshContext,
      refreshSelectedPath,
    });

    fileChangeHandler.handleFileChange(
      createFileChangeMessage({
        projectPath: "/repo/other",
      }),
    );
    await wait(30);

    expect(markStale).not.toHaveBeenCalled();
    expect(refreshSelectedPath).not.toHaveBeenCalled();
    expect(refreshContext).not.toHaveBeenCalled();
  });

  test("refreshes using the latest active context when the debounce fires", async () => {
    let activeContextId: string | null = "ctx-1";
    const refreshContext = mock(async () => {});
    const fileChangeHandler = createFileChangeHandler({
      debounceMs: 20,
      getContextId: () => activeContextId,
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => null,
      markStale: mock(() => {}),
      refreshContext,
    });

    fileChangeHandler.handleFileChange(createFileChangeMessage());
    activeContextId = "ctx-2";
    await wait(30);

    expect(refreshContext).toHaveBeenCalledWith("ctx-2");
  });

  test("clears pending refresh work on dispose", async () => {
    const refreshContext = mock(async () => {});
    const fileChangeHandler = createFileChangeHandler({
      debounceMs: 20,
      getContextId: () => "ctx-1",
      getProjectPath: () => "/repo/active",
      getSelectedPath: () => null,
      markStale: mock(() => {}),
      refreshContext,
    });

    fileChangeHandler.handleFileChange(createFileChangeMessage());
    fileChangeHandler.dispose();
    await wait(30);

    expect(refreshContext).not.toHaveBeenCalled();
  });
});

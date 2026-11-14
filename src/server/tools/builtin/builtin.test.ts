/**
 * Tests for Built-in Tools
 *
 * Comprehensive test suite for all built-in tools:
 * - git-status
 * - git-diff-summary
 * - workspace-info
 * - file-reader
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBuiltinTools } from "./index";
import type { ToolContext, ToolResult } from "../handler-strategies";

// Test paths
let tempDir: string;
const projectPath = process.cwd();

/**
 * Create mock ToolContext for testing
 */
function createMockContext(): ToolContext {
  return {
    toolUseId: "test-tool-use-id",
    sessionId: "test-session-id",
  };
}

/**
 * Helper to check if result is a text result
 */
function expectTextResult(result: ToolResult): asserts result is ToolResult & {
  content: [{ type: "text"; text: string }];
} {
  expect(result.content).toHaveLength(1);
  expect(result.content[0]).toBeDefined();
  expect(result.content[0]?.type).toBe("text");
  expect(result.content[0]).toHaveProperty("text");
}

beforeAll(async () => {
  // Create temporary directory for file-reader tests
  tempDir = join(tmpdir(), `builtin-tools-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  // Create test files in temp directory
  await writeFile(join(tempDir, "test.txt"), "Hello, World!\nLine 2\nLine 3\n");
  await writeFile(
    join(tempDir, "multiline.txt"),
    Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n"),
  );
  await writeFile(
    join(tempDir, "small.txt"),
    "This is a small file for testing.",
  );

  // Create a large file (> 1MB) for size limit test
  const largeContent = "x".repeat(2 * 1024 * 1024); // 2MB
  await writeFile(join(tempDir, "large.txt"), largeContent);
});

afterAll(async () => {
  // Clean up temporary directory
  await rm(tempDir, { recursive: true, force: true });
});

describe("createBuiltinTools", () => {
  test("returns 4 tools", () => {
    const tools = createBuiltinTools(projectPath);
    expect(tools).toHaveLength(4);
  });

  test("each tool has required properties", () => {
    const tools = createBuiltinTools(projectPath);

    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("handler");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("contains expected tool names", () => {
    const tools = createBuiltinTools(projectPath);
    const names = tools.map((t) => t.name);

    expect(names).toContain("git-status");
    expect(names).toContain("git-diff-summary");
    expect(names).toContain("workspace-info");
    expect(names).toContain("file-reader");
  });
});

describe("git-status tool", () => {
  test("returns working tree status", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitStatusTool = tools.find((t) => t.name === "git-status");
    expect(gitStatusTool).toBeDefined();

    if (gitStatusTool === undefined) {
      throw new Error("git-status tool not found");
    }

    const result = await gitStatusTool.handler({}, createMockContext());

    expectTextResult(result);
    expect(result.isError).not.toBe(true);
    expect(typeof result.content[0].text).toBe("string");
  });

  test("returns text result with content array", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitStatusTool = tools.find((t) => t.name === "git-status");

    if (gitStatusTool === undefined) {
      throw new Error("git-status tool not found");
    }

    const result = await gitStatusTool.handler({}, createMockContext());

    expect(result.content).toBeInstanceOf(Array);
    expect(result.content.length).toBeGreaterThan(0);
    expectTextResult(result);
  });

  test("handles invalid path argument gracefully", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitStatusTool = tools.find((t) => t.name === "git-status");

    if (gitStatusTool === undefined) {
      throw new Error("git-status tool not found");
    }

    const result = await gitStatusTool.handler(
      { path: 123 }, // Invalid type
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid 'path' parameter");
  });
});

describe("git-diff-summary tool", () => {
  test("returns diff summary", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitDiffTool = tools.find((t) => t.name === "git-diff-summary");
    expect(gitDiffTool).toBeDefined();

    if (gitDiffTool === undefined) {
      throw new Error("git-diff-summary tool not found");
    }

    const result = await gitDiffTool.handler({}, createMockContext());

    expectTextResult(result);
    expect(result.isError).not.toBe(true);
    expect(typeof result.content[0].text).toBe("string");
  });

  test("supports staged=true flag", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitDiffTool = tools.find((t) => t.name === "git-diff-summary");

    if (gitDiffTool === undefined) {
      throw new Error("git-diff-summary tool not found");
    }

    const result = await gitDiffTool.handler(
      { staged: true },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).not.toBe(true);
  });

  test("returns text content", async () => {
    const tools = createBuiltinTools(projectPath);
    const gitDiffTool = tools.find((t) => t.name === "git-diff-summary");

    if (gitDiffTool === undefined) {
      throw new Error("git-diff-summary tool not found");
    }

    const result = await gitDiffTool.handler({}, createMockContext());

    expect(result.content).toBeInstanceOf(Array);
    expect(result.content.length).toBeGreaterThan(0);
    expectTextResult(result);
  });
});

describe("workspace-info tool", () => {
  test("returns JSON with projectPath", async () => {
    const tools = createBuiltinTools(projectPath);
    const workspaceInfoTool = tools.find((t) => t.name === "workspace-info");
    expect(workspaceInfoTool).toBeDefined();

    if (workspaceInfoTool === undefined) {
      throw new Error("workspace-info tool not found");
    }

    const result = await workspaceInfoTool.handler({}, createMockContext());

    expectTextResult(result);
    expect(result.isError).not.toBe(true);

    const info = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(info).toHaveProperty("projectPath");
    expect(info["projectPath"]).toBe(projectPath);
  });

  test("contains branch info", async () => {
    const tools = createBuiltinTools(projectPath);
    const workspaceInfoTool = tools.find((t) => t.name === "workspace-info");

    if (workspaceInfoTool === undefined) {
      throw new Error("workspace-info tool not found");
    }

    const result = await workspaceInfoTool.handler({}, createMockContext());

    expectTextResult(result);

    const info = JSON.parse(result.content[0].text) as Record<string, unknown>;
    // Should have either branch or branchError
    const hasBranch = "branch" in info;
    const hasBranchError = "branchError" in info;
    expect(hasBranch || hasBranchError).toBe(true);

    // Since we're in a git repo, branch should be present
    expect(info).toHaveProperty("branch");
    expect(typeof info["branch"]).toBe("string");
  });

  test("contains remoteUrl or remoteUrlError", async () => {
    const tools = createBuiltinTools(projectPath);
    const workspaceInfoTool = tools.find((t) => t.name === "workspace-info");

    if (workspaceInfoTool === undefined) {
      throw new Error("workspace-info tool not found");
    }

    const result = await workspaceInfoTool.handler({}, createMockContext());

    expectTextResult(result);

    const info = JSON.parse(result.content[0].text) as Record<string, unknown>;
    // Should have either remoteUrl or remoteUrlError
    const hasRemoteUrl = "remoteUrl" in info;
    const hasRemoteUrlError = "remoteUrlError" in info;
    expect(hasRemoteUrl || hasRemoteUrlError).toBe(true);
  });

  test("result is valid JSON that can be parsed", async () => {
    const tools = createBuiltinTools(projectPath);
    const workspaceInfoTool = tools.find((t) => t.name === "workspace-info");

    if (workspaceInfoTool === undefined) {
      throw new Error("workspace-info tool not found");
    }

    const result = await workspaceInfoTool.handler({}, createMockContext());

    expectTextResult(result);

    // Should not throw when parsing
    expect(() => {
      JSON.parse(result.content[0].text);
    }).not.toThrow();

    const info = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(typeof info).toBe("object");
    expect(info).not.toBeNull();
  });
});

describe("file-reader tool", () => {
  test("reads an existing file correctly", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");
    expect(fileReaderTool).toBeDefined();

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: "test.txt" },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Hello, World!");
  });

  test("returns error for missing path parameter", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler({}, createMockContext());

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing or invalid 'path'");
  });

  test("returns error for non-string path", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: 123 },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing or invalid 'path'");
  });

  test("prevents directory traversal", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: "../../../etc/passwd" },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path traversal detected");
  });

  test("supports line range extraction with startLine and endLine", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: "multiline.txt", startLine: 1, endLine: 3 },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Line 1");
    expect(result.content[0].text).toContain("Line 2");
    expect(result.content[0].text).toContain("Line 3");
    expect(result.content[0].text).not.toContain("Line 4");
  });

  test("returns error for files exceeding size limit", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: "large.txt" },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exceeds maximum allowed size");
  });

  test("returns error for nonexistent file", async () => {
    const tools = createBuiltinTools(tempDir);
    const fileReaderTool = tools.find((t) => t.name === "file-reader");

    if (fileReaderTool === undefined) {
      throw new Error("file-reader tool not found");
    }

    const result = await fileReaderTool.handler(
      { path: "nonexistent.txt" },
      createMockContext(),
    );

    expectTextResult(result);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File reader tool error");
  });
});

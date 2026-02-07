/**
 * Tests for Handler Strategies Module
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createShellHandler,
  createHttpHandler,
  createFileReadHandler,
  createHandlerFromConfig,
  type ToolContext,
} from "./handler-strategies";
import type {
  ShellHandlerConfig,
  HttpHandlerConfig,
  FileReadHandlerConfig,
  PluginHandlerConfig,
} from "../../types/tool.js";

// Test directory paths
let testDir: string;

// Mock ToolContext for tests
const mockContext: ToolContext = {
  toolUseId: "test-tool-use-id",
  sessionId: "test-session-id",
};

// Local test server for HTTP handler tests
let httpServer: ReturnType<typeof Bun.serve> | undefined;
let httpBaseUrl: string;

beforeAll(async () => {
  // Create test directory
  testDir = join(tmpdir(), `handler-strategies-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create a test file
  await writeFile(join(testDir, "test.txt"), "Hello, World!\nThis is a test file.\n");

  // Create a subdirectory with a file (for path traversal tests)
  const subdir = join(testDir, "subdir");
  await mkdir(subdir, { recursive: true });
  await writeFile(join(subdir, "nested.txt"), "Nested file content\n");

  // Create a large file for size limit tests
  const largeContent = "x".repeat(2 * 1024 * 1024); // 2MB
  await writeFile(join(testDir, "large.txt"), largeContent);

  // Start a local HTTP server for HTTP handler tests
  httpServer = Bun.serve({
    port: 0, // Random available port
    fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/ok") {
        return new Response("OK response body", { status: 200 });
      }
      if (url.pathname === "/echo") {
        return new Response(
          JSON.stringify({
            method: req.method,
            url: req.url,
            path: url.pathname,
            search: url.search,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname.startsWith("/status/")) {
        const code = Number.parseInt(url.pathname.slice(8), 10);
        return new Response(`Status ${code}`, { status: code });
      }
      if (url.pathname.startsWith("/param/")) {
        const paramValue = url.pathname.slice(7);
        return new Response(`Param: ${paramValue}`, { status: 200 });
      }
      if (url.pathname === "/delay") {
        // Delay 10 seconds - for timeout testing
        return new Promise((resolve) =>
          setTimeout(() => resolve(new Response("delayed")), 10000),
        );
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  httpBaseUrl = `http://localhost:${httpServer.port}`;
});

afterAll(async () => {
  // Clean up test directory
  await rm(testDir, { recursive: true, force: true });
  // Stop HTTP server
  if (httpServer !== undefined) {
    httpServer.stop(true);
  }
});

describe("createShellHandler", () => {
  test("executes simple command successfully", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo Hello",
    };

    const handler = createShellHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Hello");
  });

  test("interpolates parameters correctly", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo {{message}}",
    };

    const handler = createShellHandler(config);
    const result = await handler({ message: "Test Message" }, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("Test Message");
  });

  test("handles multiple parameters", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo {{first}} {{second}}",
    };

    const handler = createShellHandler(config);
    const result = await handler(
      { first: "Hello", second: "World" },
      mockContext,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("Hello");
    expect(result.content[0]?.text).toContain("World");
  });

  test("returns error for missing parameter", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo {{missing}}",
    };

    const handler = createShellHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing required parameter");
  });

  test("returns error for non-zero exit code", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "ls /nonexistent-directory-123456",
    };

    const handler = createShellHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Command failed with exit code");
  });

  test("respects custom working directory", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "pwd",
      cwd: testDir,
    };

    const handler = createShellHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain(testDir);
  });

  test("rejects parameter with null bytes", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo {{param}}",
    };

    const handler = createShellHandler(config);
    const result = await handler({ param: "test\0value" }, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("null bytes");
  });

  test("handles timeout", async () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "sleep 10",
      timeout: 100, // Very short timeout
    };

    const handler = createShellHandler(config);
    const start = Date.now();
    const result = await handler({}, mockContext);
    const elapsed = Date.now() - start;

    // Should fail quickly due to timeout
    expect(elapsed).toBeLessThan(2000);
    expect(result.isError).toBe(true);
  });
});

describe("createHttpHandler", () => {
  test("validates URL scheme", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: "ftp://example.com",
    };

    const handler = createHttpHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid URL scheme");
  });

  test("sends GET request and returns response", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: `${httpBaseUrl}/ok`,
      method: "GET",
    };

    const handler = createHttpHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toBe("OK response body");
  });

  test("interpolates URL parameters with encoding", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: `${httpBaseUrl}/param/{{value}}`,
      method: "GET",
    };

    const handler = createHttpHandler(config);
    const result = await handler({ value: "hello world" }, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("Param: hello%20world");
  });

  test("returns error for missing URL parameter", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: `${httpBaseUrl}/{{missing}}`,
    };

    const handler = createHttpHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing required parameter");
  });

  test("handles HTTP errors", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: `${httpBaseUrl}/status/404`,
      method: "GET",
    };

    const handler = createHttpHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("HTTP 404");
  });

  test("handles timeout", async () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: `${httpBaseUrl}/delay`,
      method: "GET",
      timeout: 100, // Very short timeout
    };

    const handler = createHttpHandler(config);
    const start = Date.now();
    const result = await handler({}, mockContext);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("timed out");
  });
});

describe("createFileReadHandler", () => {
  test("reads file successfully", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: "test.txt" }, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("Hello, World!");
  });

  test("reads nested file within basePath", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: "subdir/nested.txt" }, mockContext);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("Nested file content");
  });

  test("prevents directory traversal", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: "../../../etc/passwd" }, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Path traversal detected");
  });

  test("returns error for missing path parameter", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({}, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing or invalid 'path'");
  });

  test("returns error for invalid path type", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: 123 }, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must be a string");
  });

  test("respects file size limit", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
      maxSize: 100, // Very small limit
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: "large.txt" }, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("exceeds maximum allowed size");
  });

  test("returns error for nonexistent file", async () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createFileReadHandler(config);
    const result = await handler({ path: "nonexistent-file.txt" }, mockContext);

    expect(result.isError).toBe(true);
  });
});

describe("createHandlerFromConfig", () => {
  test("creates shell handler", () => {
    const config: ShellHandlerConfig = {
      type: "shell",
      command: "echo test",
    };

    const handler = createHandlerFromConfig(config);
    expect(typeof handler).toBe("function");
  });

  test("creates http handler", () => {
    const config: HttpHandlerConfig = {
      type: "http",
      url: "https://example.com",
    };

    const handler = createHandlerFromConfig(config);
    expect(typeof handler).toBe("function");
  });

  test("creates file-read handler", () => {
    const config: FileReadHandlerConfig = {
      type: "file-read",
      basePath: testDir,
    };

    const handler = createHandlerFromConfig(config);
    expect(typeof handler).toBe("function");
  });

  test("throws error for unknown handler type", () => {
    const config = {
      type: "unknown",
    } as unknown as PluginHandlerConfig;

    expect(() => createHandlerFromConfig(config)).toThrow(
      "Unknown handler type",
    );
  });
});

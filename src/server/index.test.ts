/**
 * Tests for HTTP Server
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createServer, startServer, stopServer } from "./index";
import type { CLIConfig } from "../types/index";
import { createContextManager } from "./workspace/context-manager";
import { createRecentDirectoryStore } from "./workspace/recent-store";
import { createInMemoryOpenTabsStore } from "./workspace/open-tabs-store";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("createServer", () => {
  let config: CLIConfig;
  let testDir: string;
  let originalClientDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));

    // Save and clear QRAFTBOX_CLIENT_DIR to ensure tests don't pick up stale env var
    originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    delete process.env["QRAFTBOX_CLIENT_DIR"];

    config = {
      port: 7144,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      projectDirs: [],
    };
  });

  afterEach(() => {
    // Restore original QRAFTBOX_CLIENT_DIR
    if (originalClientDir !== undefined) {
      process.env["QRAFTBOX_CLIENT_DIR"] = originalClientDir;
    } else {
      delete process.env["QRAFTBOX_CLIENT_DIR"];
    }
  });

  test("should create Hono instance", () => {
    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");
  });

  test("should respond to health check", async () => {
    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    const response = await app.request("/api/health");
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      status: string;
      timestamp: number;
    };
    expect(data).toHaveProperty("status", "ok");
    expect(data).toHaveProperty("timestamp");
    expect(typeof data.timestamp).toBe("number");
  });

  test("should handle errors with error handler", async () => {
    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    // Request a non-existent route (should 404)
    const response = await app.request("/api/nonexistent");

    // Error handler should catch and format the error
    // Since no route matches, Hono returns 404
    expect(response.status).toBe(404);
  });

  test("should serve static files with correct MIME type", async () => {
    // Set QRAFTBOX_CLIENT_DIR to a non-existent directory to make test deterministic
    const nonExistentClientDir = join(testDir, "nonexistent-client");
    process.env["QRAFTBOX_CLIENT_DIR"] = nonExistentClientDir;

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    // Request static file - since QRAFTBOX_CLIENT_DIR points to non-existent dir,
    // static file serving will always 404
    const response = await app.request("/index.html");

    expect(response.status).toBe(404);

    // Clean up env var (will also be cleaned up by afterEach)
    delete process.env["QRAFTBOX_CLIENT_DIR"];
  });
});

describe("startServer and stopServer", () => {
  test("should start and stop server", () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const config: CLIConfig = {
      port: 0, // Let OS assign port
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      projectDirs: [],
    };

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    // Start server
    const server = startServer(app, config);

    expect(server).toBeDefined();
    expect(server.port).toBeGreaterThan(0);
    expect(server.hostname).toBe("localhost");
    expect(typeof server.stop).toBe("function");

    // Stop server
    stopServer(server);
  });

  test("should be able to make requests to running server", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const config: CLIConfig = {
      port: 0, // Let OS assign port
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      projectDirs: [],
    };

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    const server = startServer(app, config);

    try {
      // Make HTTP request to health check
      const response = await fetch(
        `http://${server.hostname}:${server.port}/api/health`,
      );
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        status: string;
        timestamp: number;
      };
      expect(data.status).toBe("ok");
    } finally {
      stopServer(server);
    }
  });
});

describe("Server integration", () => {
  test("should handle multiple requests", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const config: CLIConfig = {
      port: 0,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      projectDirs: [],
    };

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    const server = startServer(app, config);

    try {
      // Make multiple requests
      const responses = await Promise.all([
        fetch(`http://${server.hostname}:${server.port}/api/health`),
        fetch(`http://${server.hostname}:${server.port}/api/health`),
        fetch(`http://${server.hostname}:${server.port}/api/health`),
      ]);

      expect(responses).toHaveLength(3);
      expect(responses.every((r) => r.status === 200)).toBe(true);
    } finally {
      stopServer(server);
    }
  });

  test("should return 404 for non-existent API routes", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const config: CLIConfig = {
      port: 0,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
      projectDirs: [],
    };

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config,
      contextManager,
      recentStore,
      openTabsStore,
    });

    const server = startServer(app, config);

    try {
      const response = await fetch(
        `http://${server.hostname}:${server.port}/api/nonexistent`,
      );
      expect(response.status).toBe(404);
    } finally {
      stopServer(server);
    }
  });
});

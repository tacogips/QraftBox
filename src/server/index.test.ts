/**
 * Tests for HTTP Server
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createServer, startServer, stopServer } from "./index";
import type { CLIConfig } from "../types/index";
import { createContextManager } from "./workspace/context-manager";
import { createRecentDirectoryStore } from "./workspace/recent-store";
import { createInMemoryOpenTabsStore } from "./workspace/open-tabs-store";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface MockBunServer {
  readonly port: number;
  readonly hostname: string;
  stop(): void;
}

function createFrontendFixtureDir(
  baseDir: string,
  frontendDirName: string,
  html: string,
): string {
  const assetDir = join(baseDir, frontendDirName);
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "index.html"), html);
  return assetDir;
}

async function withMockedBunServe<T>(
  mockServer: MockBunServer,
  runTest: (
    serveMock: ReturnType<typeof mock<() => MockBunServer>>,
  ) => Promise<T> | T,
): Promise<T> {
  const originalServe = Bun.serve;
  const serveMock = mock(() => mockServer);

  (Bun as unknown as { serve: typeof Bun.serve }).serve =
    serveMock as unknown as typeof Bun.serve;

  try {
    return await runTest(serveMock);
  } finally {
    (Bun as unknown as { serve: typeof Bun.serve }).serve = originalServe;
  }
}

describe("createServer", () => {
  let config: CLIConfig;
  let testDir: string;
  let originalClientDir: string | undefined;
  let originalLegacyClientDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));

    // Save and clear QRAFTBOX_CLIENT_DIR to ensure tests don't pick up stale env var
    originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    originalLegacyClientDir = process.env["QRAFTBOX_CLIENT_LEGACY_DIR"];
    delete process.env["QRAFTBOX_CLIENT_DIR"];
    delete process.env["QRAFTBOX_CLIENT_LEGACY_DIR"];
    process.env["QRAFTBOX_CLIENT_DIR"] = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>Default Solid Fixture</body></html>",
    );

    config = {
      port: 7144,
      host: "localhost",
      frontend: "solid",
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

    if (originalLegacyClientDir !== undefined) {
      process.env["QRAFTBOX_CLIENT_LEGACY_DIR"] = originalLegacyClientDir;
    } else {
      delete process.env["QRAFTBOX_CLIENT_LEGACY_DIR"];
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

  test("should return 404 for missing static files", async () => {
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

    const response = await app.request("/missing-asset.js");

    expect(response.status).toBe(404);
  });

  test("should fail startup when solid frontend assets are missing", () => {
    const emptySolidClientDir = join(testDir, "client-missing");
    mkdirSync(emptySolidClientDir, { recursive: true });
    process.env["QRAFTBOX_CLIENT_DIR"] = emptySolidClientDir;

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();

    expect(() =>
      createServer({
        config: {
          ...config,
          frontend: "solid",
        },
        contextManager,
        recentStore,
        openTabsStore,
      }),
    ).toThrow("Frontend assets for 'solid' were not found.");
  });

  test("should serve the selected solid frontend bundle when assets are configured", async () => {
    const solidClientDir = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>Solid Fixture</body></html>",
    );
    process.env["QRAFTBOX_CLIENT_DIR"] = solidClientDir;

    const contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      dbPath: join(testDir, "recent.db"),
    });
    const openTabsStore = createInMemoryOpenTabsStore();
    const app = createServer({
      config: {
        ...config,
        frontend: "solid",
      },
      contextManager,
      recentStore,
      openTabsStore,
    });

    const rootResponse = await app.request("/");
    expect(rootResponse.status).toBe(200);
    await expect(rootResponse.text()).resolves.toContain("Solid Fixture");

    const nestedRouteResponse = await app.request("/projects/demo/files");
    expect(nestedRouteResponse.status).toBe(200);
    await expect(nestedRouteResponse.text()).resolves.toContain(
      "Solid Fixture",
    );

    const frontendStatusResponse = await app.request("/api/frontend-status");
    expect(frontendStatusResponse.status).toBe(200);
    await expect(frontendStatusResponse.json()).resolves.toEqual(
      expect.objectContaining({
        selectedFrontend: "solid",
        solidSupportStatus: expect.any(Object),
      }),
    );
  });
});

describe("startServer and stopServer", () => {
  test("should start and stop server", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    process.env["QRAFTBOX_CLIENT_DIR"] = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>StartServer Fixture</body></html>",
    );
    const config: CLIConfig = {
      port: 7145,
      host: "127.0.0.1",
      frontend: "solid",
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

    const stopMock = mock(() => {});
    try {
      await withMockedBunServe(
        {
          port: config.port,
          hostname: config.host,
          stop: stopMock,
        },
        (serveMock) => {
          const server = startServer(app, config);

          expect(server).toBeDefined();
          expect(server.port).toBe(config.port);
          expect(server.hostname).toBe(config.host);
          expect(typeof server.stop).toBe("function");
          expect(serveMock).toHaveBeenCalledTimes(1);

          stopServer(server);
          expect(stopMock).toHaveBeenCalledTimes(1);
        },
      );
    } finally {
      if (originalClientDir === undefined) {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      } else {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalClientDir;
      }
    }
  });

  test("should be able to make requests via app.fetch", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    process.env["QRAFTBOX_CLIENT_DIR"] = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>App Fetch Fixture</body></html>",
    );
    const config: CLIConfig = {
      port: 7146,
      host: "localhost",
      frontend: "solid",
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

    try {
      const response = await app.request("/api/health");
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        status: string;
        timestamp: number;
      };
      expect(data.status).toBe("ok");
    } finally {
      if (originalClientDir === undefined) {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      } else {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalClientDir;
      }
    }
  });
});

describe("Server integration", () => {
  test("should handle multiple in-process requests", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    process.env["QRAFTBOX_CLIENT_DIR"] = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>Integration Fixture</body></html>",
    );
    const config: CLIConfig = {
      port: 7147,
      host: "localhost",
      frontend: "solid",
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

    try {
      const responses = await Promise.all([
        app.request("/api/health"),
        app.request("/api/health"),
        app.request("/api/health"),
      ]);

      expect(responses).toHaveLength(3);
      expect(responses.every((response) => response.status === 200)).toBe(true);
    } finally {
      if (originalClientDir === undefined) {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      } else {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalClientDir;
      }
    }
  });

  test("should return 404 for non-existent API routes in-process", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "qraftbox-test-"));
    const originalClientDir = process.env["QRAFTBOX_CLIENT_DIR"];
    process.env["QRAFTBOX_CLIENT_DIR"] = createFrontendFixtureDir(
      testDir,
      "client",
      "<html><body>404 Fixture</body></html>",
    );
    const config: CLIConfig = {
      port: 7148,
      host: "localhost",
      frontend: "solid",
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

    try {
      const response = await app.request("/api/nonexistent");
      expect(response.status).toBe(404);
    } finally {
      if (originalClientDir === undefined) {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      } else {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalClientDir;
      }
    }
  });
});

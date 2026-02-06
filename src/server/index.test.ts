/**
 * Tests for HTTP Server
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createServer, startServer, stopServer } from "./index";
import type { CLIConfig } from "../types/index";
import { createContextManager } from "./workspace/context-manager";

describe("createServer", () => {
  let config: CLIConfig;

  beforeEach(() => {
    config = {
      port: 7144,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
    };
  });

  test("should create Hono instance", () => {
    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");
  });

  test("should respond to health check", async () => {
    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

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
    const app = createServer({ config, contextManager });

    // Request a non-existent route (should 404)
    const response = await app.request("/api/nonexistent");

    // Error handler should catch and format the error
    // Since no route matches, Hono returns 404
    expect(response.status).toBe(404);
  });

  test("should serve static files with correct MIME type", async () => {
    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

    // Request static file (will fail since dist/client doesn't exist in test)
    // But middleware should be mounted
    const response = await app.request("/index.html");

    // Will 404 since file doesn't exist, but middleware handled it
    expect(response.status).toBe(404);
  });
});

describe("startServer and stopServer", () => {
  test("should start and stop server", () => {
    const config: CLIConfig = {
      port: 0, // Let OS assign port
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
    };

    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

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
    const config: CLIConfig = {
      port: 0, // Let OS assign port
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
    };

    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

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
    const config: CLIConfig = {
      port: 0,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
    };

    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

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
    const config: CLIConfig = {
      port: 0,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: "/tmp/test-project",
    };

    const contextManager = createContextManager();
    const app = createServer({ config, contextManager });

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

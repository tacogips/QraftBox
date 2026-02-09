/**
 * CLI Entry Point Tests
 *
 * Tests for CLI argument parsing, browser opening, and shutdown handlers.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { parseArgs, openBrowser, setupShutdownHandlers } from "./index";

describe("parseArgs", () => {
  test("parses default arguments", () => {
    const args = ["node", "script.js"];
    const config = parseArgs(args);

    expect(config).toEqual({
      port: 7144,
      host: "localhost",
      open: false,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: ".",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
    });
  });

  test("parses custom port", () => {
    const args = ["node", "script.js", "--port", "8080"];
    const config = parseArgs(args);

    expect(config.port).toBe(8080);
  });

  test("parses custom host", () => {
    const args = ["node", "script.js", "--host", "0.0.0.0"];
    const config = parseArgs(args);

    expect(config.host).toBe("0.0.0.0");
  });

  test("defaults open to false", () => {
    const args = ["node", "script.js"];
    const config = parseArgs(args);

    expect(config.open).toBe(false);
  });

  test("parses --open flag", () => {
    const args = ["node", "script.js", "--open"];
    const config = parseArgs(args);

    expect(config.open).toBe(true);
  });

  test("parses --no-watch flag", () => {
    const args = ["node", "script.js", "--no-watch"];
    const config = parseArgs(args);

    expect(config.watch).toBe(false);
  });

  test("parses --watch flag", () => {
    const args = ["node", "script.js", "--watch"];
    const config = parseArgs(args);

    expect(config.watch).toBe(true);
  });

  test("parses sync-mode manual", () => {
    const args = ["node", "script.js", "--sync-mode", "manual"];
    const config = parseArgs(args);

    expect(config.syncMode).toBe("manual");
  });

  test("parses sync-mode auto-push", () => {
    const args = ["node", "script.js", "--sync-mode", "auto-push"];
    const config = parseArgs(args);

    expect(config.syncMode).toBe("auto-push");
  });

  test("parses sync-mode auto-pull", () => {
    const args = ["node", "script.js", "--sync-mode", "auto-pull"];
    const config = parseArgs(args);

    expect(config.syncMode).toBe("auto-pull");
  });

  test("parses sync-mode auto", () => {
    const args = ["node", "script.js", "--sync-mode", "auto"];
    const config = parseArgs(args);

    expect(config.syncMode).toBe("auto");
  });

  test("parses --no-ai flag", () => {
    const args = ["node", "script.js", "--no-ai"];
    const config = parseArgs(args);

    expect(config.ai).toBe(false);
  });

  test("parses --ai flag", () => {
    const args = ["node", "script.js", "--ai"];
    const config = parseArgs(args);

    expect(config.ai).toBe(true);
  });

  test("parses positional project path", () => {
    const args = ["node", "script.js", "./my-project"];
    const config = parseArgs(args);

    expect(config.projectPath).toBe("./my-project");
  });

  test("parses all options together", () => {
    const args = [
      "node",
      "script.js",
      "--port",
      "9000",
      "--host",
      "127.0.0.1",
      "--no-watch",
      "--sync-mode",
      "auto",
      "--no-ai",
      "/path/to/project",
    ];
    const config = parseArgs(args);

    expect(config).toEqual({
      port: 9000,
      host: "127.0.0.1",
      open: false,
      watch: false,
      syncMode: "auto",
      ai: false,
      projectPath: "/path/to/project",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
    });
  });

  test("throws error for invalid port number", () => {
    const args = ["node", "script.js", "--port", "not-a-number"];

    expect(() => parseArgs(args)).toThrow("Invalid port number");
  });

  test("throws error for port out of range (too low)", () => {
    const args = ["node", "script.js", "--port", "0"];

    expect(() => parseArgs(args)).toThrow("Invalid port number");
  });

  test("throws error for port out of range (too high)", () => {
    const args = ["node", "script.js", "--port", "65536"];

    expect(() => parseArgs(args)).toThrow("Invalid port number");
  });

  test("throws error for invalid sync mode", () => {
    const args = ["node", "script.js", "--sync-mode", "invalid-mode"];

    expect(() => parseArgs(args)).toThrow("Invalid sync mode");
  });

  test("accepts valid port at lower boundary", () => {
    const args = ["node", "script.js", "--port", "1"];
    const config = parseArgs(args);

    expect(config.port).toBe(1);
  });

  test("accepts valid port at upper boundary", () => {
    const args = ["node", "script.js", "--port", "65535"];
    const config = parseArgs(args);

    expect(config.port).toBe(65535);
  });
});

describe("openBrowser", () => {
  // Store original platform
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      writable: true,
    });
  });

  test("calls open command on macOS", async () => {
    // Mock platform as darwin (macOS)
    Object.defineProperty(process, "platform", {
      value: "darwin",
      writable: true,
    });

    // Mock Bun.spawn
    const originalSpawn = Bun.spawn;
    let spawnedCommand: string | undefined;
    let spawnedArgs: string[] | undefined;

    Bun.spawn = ((command: string[]) => {
      spawnedCommand = command[0];
      spawnedArgs = command.slice(1);
      return {
        exited: Promise.resolve(0),
      };
    }) as typeof Bun.spawn;

    try {
      await openBrowser("http://localhost:7144");

      expect(spawnedCommand).toBe("open");
      expect(spawnedArgs).toEqual(["http://localhost:7144"]);
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  test("calls xdg-open command on Linux", async () => {
    // Mock platform as linux
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
    });

    // Mock Bun.spawn
    const originalSpawn = Bun.spawn;
    let spawnedCommand: string | undefined;
    let spawnedArgs: string[] | undefined;

    Bun.spawn = ((command: string[]) => {
      spawnedCommand = command[0];
      spawnedArgs = command.slice(1);
      return {
        exited: Promise.resolve(0),
      };
    }) as typeof Bun.spawn;

    try {
      await openBrowser("http://localhost:7144");

      expect(spawnedCommand).toBe("xdg-open");
      expect(spawnedArgs).toEqual(["http://localhost:7144"]);
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  test("calls cmd /c start command on Windows", async () => {
    // Mock platform as win32
    Object.defineProperty(process, "platform", {
      value: "win32",
      writable: true,
    });

    // Mock Bun.spawn
    const originalSpawn = Bun.spawn;
    let spawnedCommand: string | undefined;
    let spawnedArgs: string[] | undefined;

    Bun.spawn = ((command: string[]) => {
      spawnedCommand = command[0];
      spawnedArgs = command.slice(1);
      return {
        exited: Promise.resolve(0),
      };
    }) as typeof Bun.spawn;

    try {
      await openBrowser("http://localhost:7144");

      expect(spawnedCommand).toBe("cmd");
      expect(spawnedArgs).toEqual(["/c", "start", "http://localhost:7144"]);
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  test("silently ignores spawn errors", async () => {
    // Mock Bun.spawn to throw error
    const originalSpawn = Bun.spawn;

    Bun.spawn = (() => {
      throw new Error("Command not found");
    }) as typeof Bun.spawn;

    try {
      // Should not throw
      await expect(
        openBrowser("http://localhost:7144"),
      ).resolves.toBeUndefined();
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  test("silently ignores process exit errors", async () => {
    // Mock Bun.spawn to return process that fails
    const originalSpawn = Bun.spawn;

    Bun.spawn = (() => {
      return {
        exited: Promise.reject(new Error("Process failed")),
      } as unknown;
    }) as typeof Bun.spawn;

    try {
      // Should not throw
      await expect(
        openBrowser("http://localhost:7144"),
      ).resolves.toBeUndefined();
    } finally {
      Bun.spawn = originalSpawn;
    }
  });
});

describe("setupShutdownHandlers", () => {
  let originalProcessOn: typeof process.on;
  let originalProcessExit: typeof process.exit;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  const registeredHandlers: Map<string, (() => void)[]> = new Map();
  let exitCode: number | undefined;
  let logMessages: string[] = [];
  let errorMessages: string[] = [];

  beforeEach(() => {
    // Store originals
    originalProcessOn = process.on;
    originalProcessExit = process.exit;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;

    // Reset state
    registeredHandlers.clear();
    exitCode = undefined;
    logMessages = [];
    errorMessages = [];

    // Mock process.on
    process.on = ((event: string, handler: () => void) => {
      const handlers = registeredHandlers.get(event) ?? [];
      handlers.push(handler);
      registeredHandlers.set(event, handlers);
      return process;
    }) as typeof process.on;

    // Mock process.exit
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    // Mock console.log
    console.log = ((...args: unknown[]) => {
      logMessages.push(args.join(" "));
    }) as typeof console.log;

    // Mock console.error
    console.error = ((...args: unknown[]) => {
      errorMessages.push(args.join(" "));
    }) as typeof console.error;
  });

  afterEach(() => {
    // Restore originals
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  test("registers SIGINT handler", () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    expect(registeredHandlers.has("SIGINT")).toBe(true);
  });

  test("registers SIGTERM handler", () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    expect(registeredHandlers.has("SIGTERM")).toBe(true);
  });

  test("calls cleanup function on SIGINT", async () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    // Trigger SIGINT handler
    const handlers = registeredHandlers.get("SIGINT");
    expect(handlers).toBeDefined();
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(cleanup).toHaveBeenCalled();
  });

  test("calls cleanup function on SIGTERM", async () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    // Trigger SIGTERM handler
    const handlers = registeredHandlers.get("SIGTERM");
    expect(handlers).toBeDefined();
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(cleanup).toHaveBeenCalled();
  });

  test("exits with code 0 after successful cleanup", async () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    // Trigger SIGINT handler
    const handlers = registeredHandlers.get("SIGINT");
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(exitCode).toBe(0);
  });

  test("exits with code 1 after failed cleanup", async () => {
    const cleanup = mock(async () => {
      throw new Error("Cleanup failed");
    });
    setupShutdownHandlers(cleanup);

    // Trigger SIGINT handler
    const handlers = registeredHandlers.get("SIGINT");
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(exitCode).toBe(1);
  });

  test("logs shutdown message for SIGINT", async () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    // Trigger SIGINT handler
    const handlers = registeredHandlers.get("SIGINT");
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logMessages[0]).toContain("SIGINT");
    expect(logMessages[0]).toContain("shutting down gracefully");
  });

  test("logs shutdown message for SIGTERM", async () => {
    const cleanup = mock(async () => {});
    setupShutdownHandlers(cleanup);

    // Trigger SIGTERM handler
    const handlers = registeredHandlers.get("SIGTERM");
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logMessages[0]).toContain("SIGTERM");
    expect(logMessages[0]).toContain("shutting down gracefully");
  });

  test("logs error message on cleanup failure", async () => {
    const cleanup = mock(async () => {
      throw new Error("Database connection error");
    });
    setupShutdownHandlers(cleanup);

    // Trigger SIGINT handler
    const handlers = registeredHandlers.get("SIGINT");
    if (handlers !== undefined) {
      handlers[0]?.();
    }

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorMessages[0]).toContain("Error during shutdown");
    expect(errorMessages[0]).toContain("Database connection error");
  });
});

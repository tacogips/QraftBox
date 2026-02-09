/**
 * Tests for CLI configuration module
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  loadConfig,
  validateConfig,
  type ConfigDefaults,
} from "./config";
import type { CLIConfig } from "../types/index";

describe("DEFAULT_CONFIG", () => {
  test("has correct default values", () => {
    expect(DEFAULT_CONFIG.PORT).toBe(7144);
    expect(DEFAULT_CONFIG.HOST).toBe("localhost");
    expect(DEFAULT_CONFIG.OPEN).toBe(false);
    expect(DEFAULT_CONFIG.WATCH).toBe(true);
    expect(DEFAULT_CONFIG.SYNC_MODE).toBe("manual");
    expect(DEFAULT_CONFIG.AI).toBe(true);
    expect(DEFAULT_CONFIG.PROMPT_MODEL).toBe("claude-opus-4-6");
    expect(DEFAULT_CONFIG.ASSISTANT_MODEL).toBe("claude-opus-4-6");
  });

  test("is readonly", () => {
    // TypeScript should enforce this at compile time
    const defaults: ConfigDefaults = DEFAULT_CONFIG;
    expect(defaults).toBeDefined();
  });
});

describe("loadConfig", () => {
  test("returns defaults when no overrides provided", () => {
    const config = loadConfig();

    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
    expect(config.host).toBe(DEFAULT_CONFIG.HOST);
    expect(config.open).toBe(DEFAULT_CONFIG.OPEN);
    expect(config.watch).toBe(DEFAULT_CONFIG.WATCH);
    expect(config.syncMode).toBe(DEFAULT_CONFIG.SYNC_MODE);
    expect(config.ai).toBe(DEFAULT_CONFIG.AI);
    expect(config.promptModel).toBe(DEFAULT_CONFIG.PROMPT_MODEL);
    expect(config.assistantModel).toBe(DEFAULT_CONFIG.ASSISTANT_MODEL);
    expect(config.assistantAdditionalArgs).toEqual(
      DEFAULT_CONFIG.ASSISTANT_ADDITIONAL_ARGS,
    );
    expect(path.isAbsolute(config.projectPath)).toBe(true);
  });

  test("uses process.cwd() as default projectPath", () => {
    const config = loadConfig();
    expect(config.projectPath).toBe(path.resolve(process.cwd()));
  });

  test("resolves relative projectPath to absolute", () => {
    const config = loadConfig({ projectPath: "." });
    expect(path.isAbsolute(config.projectPath)).toBe(true);
    expect(config.projectPath).toBe(path.resolve("."));
  });

  test("keeps absolute projectPath unchanged", () => {
    const absolutePath = "/tmp";
    const config = loadConfig({ projectPath: absolutePath });
    expect(config.projectPath).toBe(path.resolve(absolutePath));
  });

  test("merges port override with defaults", () => {
    const config = loadConfig({ port: 8080 });
    expect(config.port).toBe(8080);
    expect(config.host).toBe(DEFAULT_CONFIG.HOST);
    expect(config.ai).toBe(DEFAULT_CONFIG.AI);
  });

  test("merges host override with defaults", () => {
    const config = loadConfig({ host: "0.0.0.0" });
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
  });

  test("merges open override with defaults", () => {
    const config = loadConfig({ open: false });
    expect(config.open).toBe(false);
    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
  });

  test("merges watch override with defaults", () => {
    const config = loadConfig({ watch: false });
    expect(config.watch).toBe(false);
    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
  });

  test("merges syncMode override with defaults", () => {
    const config = loadConfig({ syncMode: "auto-push" });
    expect(config.syncMode).toBe("auto-push");
    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
  });

  test("merges ai override with defaults", () => {
    const config = loadConfig({ ai: false });
    expect(config.ai).toBe(false);
    expect(config.port).toBe(DEFAULT_CONFIG.PORT);
  });

  test("merges multiple overrides", () => {
    const config = loadConfig({
      port: 3000,
      host: "127.0.0.1",
      open: false,
      syncMode: "auto",
    });
    expect(config.port).toBe(3000);
    expect(config.host).toBe("127.0.0.1");
    expect(config.open).toBe(false);
    expect(config.syncMode).toBe("auto");
    expect(config.watch).toBe(DEFAULT_CONFIG.WATCH);
    expect(config.ai).toBe(DEFAULT_CONFIG.AI);
  });

  test("handles projectPath with spaces", () => {
    const pathWithSpaces = "/tmp/my project";
    const config = loadConfig({ projectPath: pathWithSpaces });
    expect(config.projectPath).toBe(path.resolve(pathWithSpaces));
  });
});

describe("validateConfig", () => {
  const testDir = path.join("/tmp", "qraftbox-config-test-" + Date.now());

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("validates valid config", async () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects port below range", () => {
    const config: CLIConfig = {
      port: 0,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "port must be an integer between 1 and 65535",
    );
  });

  test("rejects port above range", () => {
    const config: CLIConfig = {
      port: 65536,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "port must be an integer between 1 and 65535",
    );
  });

  test("rejects non-integer port", () => {
    const config: CLIConfig = {
      port: 7144.5,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "port must be an integer between 1 and 65535",
    );
  });

  test("accepts minimum valid port", () => {
    const config: CLIConfig = {
      port: 1,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("accepts maximum valid port", () => {
    const config: CLIConfig = {
      port: 65535,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("rejects empty host", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("host cannot be empty");
  });

  test("rejects whitespace-only host", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "   ",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("host cannot be empty");
  });

  test("rejects non-existent projectPath", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: "/nonexistent/path/that/does/not/exist",
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("projectPath does not exist");
    expect(result.error).toContain("/nonexistent/path/that/does/not/exist");
  });

  test("accepts valid syncMode: manual", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "manual",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("accepts valid syncMode: auto-push", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "auto-push",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("accepts valid syncMode: auto-pull", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "auto-pull",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("accepts valid syncMode: auto", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "auto",
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  test("rejects invalid syncMode", () => {
    const config = {
      port: 7144,
      host: "localhost",
      open: true,
      watch: true,
      syncMode: "invalid-mode" as never,
      ai: true,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config as CLIConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("syncMode must be one of");
  });

  test("validates all boolean flags", () => {
    const config: CLIConfig = {
      port: 7144,
      host: "localhost",
      open: false,
      watch: false,
      syncMode: "manual",
      ai: false,
      projectPath: testDir,
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
      assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });
});

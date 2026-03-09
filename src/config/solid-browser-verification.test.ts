import { describe, expect, test } from "bun:test";
import {
  createAgentBrowserEnvironment,
  getBrowserVerificationUsage,
  parseBrowserVerificationCliArgs,
  runFrontendMigrationBrowserVerification,
} from "./solid-browser-verification";

describe("solid browser verification", () => {
  test("parses default frontend URLs", () => {
    expect(parseBrowserVerificationCliArgs([])).toEqual({
      targets: [
        {
          frontend: "svelte",
          baseUrl: "http://127.0.0.1:7155",
        },
        {
          frontend: "solid",
          baseUrl: "http://127.0.0.1:7156",
        },
      ],
      showHelp: false,
      useManagedSharedBackend: true,
    });
  });

  test("parses explicit frontend URLs and normalizes trailing slashes", () => {
    expect(
      parseBrowserVerificationCliArgs([
        "--svelte-url",
        "http://localhost:8001/",
        "--solid-url",
        "http://localhost:8002/",
      ]),
    ).toEqual({
      targets: [
        {
          frontend: "svelte",
          baseUrl: "http://localhost:8001",
        },
        {
          frontend: "solid",
          baseUrl: "http://localhost:8002",
        },
      ],
      showHelp: false,
      useManagedSharedBackend: false,
    });
  });

  test("rejects unknown arguments", () => {
    expect(() =>
      parseBrowserVerificationCliArgs(["--unknown-flag"]),
    ).toThrow("Unknown argument: --unknown-flag");
  });

  test("builds a filtered agent-browser environment without secret-like vars", () => {
    process.env["PATH"] = "/usr/bin";
    process.env["HOME"] = "/tmp/home";
    process.env["NPM_TOKEN"] = "do-not-forward";

    const agentBrowserEnvironment = createAgentBrowserEnvironment();

    expect(agentBrowserEnvironment).toEqual(
      expect.objectContaining({
        HOME: "/tmp/home",
        PATH: "/usr/bin",
      }),
    );
    expect(agentBrowserEnvironment["NPM_TOKEN"]).toBeUndefined();
  });

  test("runs both scenarios for both frontends and records the marker on success", async () => {
    const commands: string[][] = [];

    const result = await runFrontendMigrationBrowserVerification(
      [
        {
          frontend: "svelte",
          baseUrl: "http://localhost:7001",
        },
        {
          frontend: "solid",
          baseUrl: "http://localhost:7002",
        },
      ],
      {
        cwd: "/tmp/workspace",
        commandRunner: async (commandArguments) => {
          commands.push([...commandArguments]);
          if (commandArguments.includes("get")) {
            return "visible body text";
          }
          return "";
        },
        recordPassed: (cwd) => `${cwd}/tmp-solid-browser-verification.json`,
      },
    );

    expect(result).toEqual({
      markerPath: "/tmp/workspace/tmp-solid-browser-verification.json",
      targets: [
        {
          frontend: "svelte",
          baseUrl: "http://localhost:7001",
        },
        {
          frontend: "solid",
          baseUrl: "http://localhost:7002",
        },
      ],
    });

    expect(commands).toEqual([
      [
        "--session",
        "qraftbox-migration-svelte",
        "open",
        "http://localhost:7001#/project",
      ],
      ["--session", "qraftbox-migration-svelte", "wait", "--load", "networkidle"],
      ["--session", "qraftbox-migration-svelte", "get", "text", "body"],
      ["--session", "qraftbox-migration-svelte", "snapshot", "-i"],
      ["--session", "qraftbox-migration-svelte", "screenshot", "--full"],
      [
        "--session",
        "qraftbox-migration-svelte",
        "open",
        "http://localhost:7001#/files",
      ],
      ["--session", "qraftbox-migration-svelte", "wait", "--load", "networkidle"],
      ["--session", "qraftbox-migration-svelte", "get", "text", "body"],
      ["--session", "qraftbox-migration-svelte", "snapshot", "-i"],
      ["--session", "qraftbox-migration-svelte", "screenshot", "--full"],
      ["--session", "qraftbox-migration-svelte", "close"],
      [
        "--session",
        "qraftbox-migration-solid",
        "open",
        "http://localhost:7002#/project",
      ],
      ["--session", "qraftbox-migration-solid", "wait", "--load", "networkidle"],
      ["--session", "qraftbox-migration-solid", "get", "text", "body"],
      ["--session", "qraftbox-migration-solid", "snapshot", "-i"],
      ["--session", "qraftbox-migration-solid", "screenshot", "--full"],
      [
        "--session",
        "qraftbox-migration-solid",
        "open",
        "http://localhost:7002#/files",
      ],
      ["--session", "qraftbox-migration-solid", "wait", "--load", "networkidle"],
      ["--session", "qraftbox-migration-solid", "get", "text", "body"],
      ["--session", "qraftbox-migration-solid", "snapshot", "-i"],
      ["--session", "qraftbox-migration-solid", "screenshot", "--full"],
      ["--session", "qraftbox-migration-solid", "close"],
    ]);
  });

  test("still closes the current browser session when verification fails", async () => {
    const commands: string[][] = [];

    await expect(
      runFrontendMigrationBrowserVerification(
        [
          {
            frontend: "svelte",
            baseUrl: "http://localhost:7001",
          },
        ],
        {
          commandRunner: async (commandArguments) => {
            commands.push([...commandArguments]);
            if (commandArguments[2] === "get") {
              return "";
            }
            return "";
          },
        },
      ),
    ).rejects.toThrow("empty body text snapshot");

    expect(commands.at(-1)).toEqual([
      "--session",
      "qraftbox-migration-svelte",
      "close",
    ]);
  });

  test("documents the browser verification usage", () => {
    expect(getBrowserVerificationUsage()).toContain(
      "bun run verify:frontend:migration:browser",
    );
  });
});

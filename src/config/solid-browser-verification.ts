import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordSolidBrowserVerificationPassed } from "./solid-migration-check";
import { listBrowserVerificationScenarios } from "../../client-shared/src/testing/browser-verification";
import { createContextManager } from "../server/workspace/context-manager";
import { createInMemoryProjectRegistry } from "../server/workspace/project-registry";
import { createRecentDirectoryStore } from "../server/workspace/recent-store";
import { createInMemoryOpenTabsStore } from "../server/workspace/open-tabs-store";
import { createServer } from "../server/index";
import type { CLIConfig } from "../types";

export interface FrontendVerificationTarget {
  readonly frontend: "svelte" | "solid";
  readonly baseUrl: string;
}

export interface BrowserVerificationScenario {
  readonly name: string;
  readonly routeHash:
    | "#/project"
    | "#/files"
    | "#/ai-session"
    | "#/commits"
    | "#/terminal"
    | "#/system-info"
    | "#/notifications"
    | "#/model-profiles"
    | "#/action-defaults";
  readonly requiredTextSubstrings?: readonly string[] | undefined;
  readonly forbiddenTextSubstrings?: readonly string[] | undefined;
  readonly requiredApiPathSubstrings?: readonly string[] | undefined;
  readonly forbiddenApiPathSubstrings?: readonly string[] | undefined;
}

export interface BrowserVerificationRunOptions {
  readonly cwd?: string | undefined;
  readonly commandRunner?: BrowserVerificationCommandRunner | undefined;
  readonly getObservedApiPaths?:
    | ((
        frontend: FrontendVerificationTarget["frontend"],
        scenario: BrowserVerificationScenario,
      ) => readonly string[])
    | undefined;
  readonly recordPassed?: ((cwd?: string | undefined) => string) | undefined;
}

export type BrowserVerificationCommandRunner = (
  commandArguments: readonly string[],
) => Promise<string>;

export interface ParsedBrowserVerificationCliArgs {
  readonly targets: readonly FrontendVerificationTarget[];
  readonly showHelp: boolean;
  readonly useManagedSharedBackend: boolean;
}

export interface BrowserVerificationRunResult {
  readonly markerPath: string;
  readonly targets: readonly FrontendVerificationTarget[];
}

const DEFAULT_FRONTEND_VERIFICATION_TARGETS: readonly FrontendVerificationTarget[] =
  [
    {
      frontend: "svelte",
      baseUrl: "http://127.0.0.1:7155",
    },
    {
      frontend: "solid",
      baseUrl: "http://127.0.0.1:7156",
    },
  ] as const;

const BROWSER_VERIFICATION_SCENARIOS: readonly BrowserVerificationScenario[] = [
  {
    name: "project",
    routeHash: "#/project",
  },
  {
    name: "files",
    routeHash: "#/files",
  },
] as const;

const DEFAULT_SVELTE_VERIFICATION_URL =
  DEFAULT_FRONTEND_VERIFICATION_TARGETS[0]?.baseUrl ?? "http://127.0.0.1:7155";
const DEFAULT_SOLID_VERIFICATION_URL =
  DEFAULT_FRONTEND_VERIFICATION_TARGETS[1]?.baseUrl ?? "http://127.0.0.1:7156";

function parseFrontendVerificationUrl(
  value: string,
  frontend: FrontendVerificationTarget["frontend"],
): FrontendVerificationTarget {
  const parsedUrl = new URL(value);
  return {
    frontend,
    baseUrl: parsedUrl.toString().replace(/\/$/, ""),
  };
}

export function parseBrowserVerificationCliArgs(
  args: readonly string[],
): ParsedBrowserVerificationCliArgs {
  let svelteUrl = DEFAULT_SVELTE_VERIFICATION_URL;
  let solidUrl = DEFAULT_SOLID_VERIFICATION_URL;
  let showHelp = false;
  let useManagedSharedBackend = true;

  for (let argumentIndex = 0; argumentIndex < args.length; argumentIndex += 1) {
    const argument = args[argumentIndex];

    if (argument === "--help" || argument === "-h") {
      showHelp = true;
      continue;
    }

    if (argument === "--svelte-url") {
      const nextValue = args[argumentIndex + 1];
      if (nextValue === undefined) {
        throw new Error("--svelte-url requires a value");
      }
      svelteUrl = parseFrontendVerificationUrl(nextValue, "svelte").baseUrl;
      useManagedSharedBackend = false;
      argumentIndex += 1;
      continue;
    }

    if (argument === "--solid-url") {
      const nextValue = args[argumentIndex + 1];
      if (nextValue === undefined) {
        throw new Error("--solid-url requires a value");
      }
      solidUrl = parseFrontendVerificationUrl(nextValue, "solid").baseUrl;
      useManagedSharedBackend = false;
      argumentIndex += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    targets: [
      {
        frontend: "svelte",
        baseUrl: svelteUrl,
      },
      {
        frontend: "solid",
        baseUrl: solidUrl,
      },
    ],
    showHelp,
    useManagedSharedBackend,
  };
}

export function createAgentBrowserEnvironment(): Record<string, string> {
  const candidateEnvironment = {
    HOME: process.env["HOME"],
    LANG: process.env["LANG"],
    LC_ALL: process.env["LC_ALL"],
    PATH: process.env["PATH"],
    PLAYWRIGHT_BROWSERS_PATH: process.env["PLAYWRIGHT_BROWSERS_PATH"],
    TERM: process.env["TERM"],
    TMPDIR: process.env["TMPDIR"],
    WAYLAND_DISPLAY: process.env["WAYLAND_DISPLAY"],
    XDG_RUNTIME_DIR: process.env["XDG_RUNTIME_DIR"],
    DISPLAY: process.env["DISPLAY"],
  } satisfies Record<string, string | undefined>;

  return Object.fromEntries(
    Object.entries(candidateEnvironment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function runAgentBrowserCommand(
  commandArguments: readonly string[],
): Promise<string> {
  const agentBrowserExecutable = Bun.which("agent-browser");
  if (agentBrowserExecutable === null) {
    throw new Error("agent-browser is not installed or not available on PATH.");
  }

  const browserProcess = Bun.spawn(
    [agentBrowserExecutable, ...commandArguments],
    {
      cwd: process.cwd(),
      env: createAgentBrowserEnvironment(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    browserProcess.exited,
    new Response(browserProcess.stdout).text(),
    new Response(browserProcess.stderr).text(),
  ]);

  if (exitCode !== 0) {
    const stderrMessage = stderrText.trim();
    throw new Error(
      stderrMessage.length > 0
        ? stderrMessage
        : `agent-browser exited with code ${exitCode}`,
    );
  }

  return stdoutText.trim();
}

function createBrowserSessionName(
  frontend: FrontendVerificationTarget["frontend"],
): string {
  return `qraftbox-migration-${frontend}`;
}

function apiPathSubstringWasObserved(
  observedApiPaths: readonly string[],
  requiredApiPath: string,
): boolean {
  return observedApiPaths.some((observedPath) =>
    observedPath.includes(requiredApiPath),
  );
}

async function waitForObservedApiPaths(
  target: FrontendVerificationTarget,
  scenario: BrowserVerificationScenario,
  getObservedApiPaths:
    | ((
        frontend: FrontendVerificationTarget["frontend"],
        scenario: BrowserVerificationScenario,
      ) => readonly string[])
    | undefined,
): Promise<readonly string[]> {
  if (getObservedApiPaths === undefined) {
    return [];
  }

  const requiredApiPaths = scenario.requiredApiPathSubstrings ?? [];
  const forbiddenApiPaths = scenario.forbiddenApiPathSubstrings ?? [];
  let observedApiPaths = getObservedApiPaths(target.frontend, scenario);

  for (let attemptIndex = 0; attemptIndex < 20; attemptIndex += 1) {
    observedApiPaths = getObservedApiPaths(target.frontend, scenario);
    const hasAllRequiredApiPaths = requiredApiPaths.every((requiredApiPath) =>
      apiPathSubstringWasObserved(observedApiPaths, requiredApiPath),
    );
    const hasForbiddenApiPath = forbiddenApiPaths.some((forbiddenApiPath) =>
      apiPathSubstringWasObserved(observedApiPaths, forbiddenApiPath),
    );

    if (hasAllRequiredApiPaths && !hasForbiddenApiPath) {
      return observedApiPaths;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return observedApiPaths;
}

async function verifyScenarioInBrowser(
  target: FrontendVerificationTarget,
  scenario: BrowserVerificationScenario,
  commandRunner: BrowserVerificationCommandRunner,
  getObservedApiPaths?:
    | ((
        frontend: FrontendVerificationTarget["frontend"],
        scenario: BrowserVerificationScenario,
      ) => readonly string[])
    | undefined,
): Promise<void> {
  const sessionName = createBrowserSessionName(target.frontend);
  const scenarioUrl = `${target.baseUrl}${scenario.routeHash}`;
  await commandRunner(["--session", sessionName, "open", scenarioUrl]);
  await commandRunner([
    "--session",
    sessionName,
    "wait",
    "--load",
    "networkidle",
  ]);

  const bodyText = await commandRunner([
    "--session",
    sessionName,
    "get",
    "text",
    "body",
  ]);
  if (bodyText.length === 0) {
    throw new Error(
      `agent-browser loaded ${scenarioUrl} but returned an empty body text snapshot.`,
    );
  }

  for (const requiredText of scenario.requiredTextSubstrings ?? []) {
    if (!bodyText.includes(requiredText)) {
      throw new Error(
        `agent-browser loaded ${scenarioUrl} but did not render required text: ${requiredText}`,
      );
    }
  }

  for (const forbiddenText of scenario.forbiddenTextSubstrings ?? []) {
    if (bodyText.includes(forbiddenText)) {
      throw new Error(
        `agent-browser loaded ${scenarioUrl} but rendered forbidden text: ${forbiddenText}`,
      );
    }
  }

  const observedApiPaths = await waitForObservedApiPaths(
    target,
    scenario,
    getObservedApiPaths,
  );
  for (const requiredApiPath of scenario.requiredApiPathSubstrings ?? []) {
    if (!apiPathSubstringWasObserved(observedApiPaths, requiredApiPath)) {
      throw new Error(
        `agent-browser loaded ${scenarioUrl} but the ${target.frontend} frontend did not request an API path containing: ${requiredApiPath}`,
      );
    }
  }

  for (const forbiddenApiPath of scenario.forbiddenApiPathSubstrings ?? []) {
    if (apiPathSubstringWasObserved(observedApiPaths, forbiddenApiPath)) {
      throw new Error(
        `agent-browser loaded ${scenarioUrl} but the ${target.frontend} frontend unexpectedly requested an API path containing: ${forbiddenApiPath}`,
      );
    }
  }

  await commandRunner(["--session", sessionName, "snapshot", "-i"]);
  await commandRunner(["--session", sessionName, "screenshot", "--full"]);
}

export async function runFrontendMigrationBrowserVerification(
  targets: readonly FrontendVerificationTarget[],
  options: BrowserVerificationRunOptions = {},
): Promise<BrowserVerificationRunResult> {
  const commandRunner = options.commandRunner ?? runAgentBrowserCommand;
  const recordPassed =
    options.recordPassed ?? recordSolidBrowserVerificationPassed;

  for (const target of targets) {
    const sessionName = createBrowserSessionName(target.frontend);
    try {
      for (const scenario of BROWSER_VERIFICATION_SCENARIOS) {
        await verifyScenarioInBrowser(
          target,
          scenario,
          commandRunner,
          options.getObservedApiPaths,
        );
      }
    } finally {
      try {
        await commandRunner(["--session", sessionName, "close"]);
      } catch {
        // A failed cleanup must not mask the original verification error.
      }
    }
  }

  return {
    markerPath: recordPassed(options.cwd),
    targets,
  };
}

interface ManagedVerificationWorkspace {
  readonly rootDir: string;
  readonly gitProjectPath: string;
  readonly nonGitProjectPath: string;
  cleanup(): void;
}

interface ManagedFrontendServerHandle {
  readonly target: FrontendVerificationTarget;
  readonly requestLog: string[];
  stop(): void;
}

interface ManagedVerificationServerSet {
  readonly targets: readonly FrontendVerificationTarget[];
  readonly requestLogs: Readonly<
    Record<FrontendVerificationTarget["frontend"], readonly string[]>
  >;
  stop(): void;
}

const MANAGED_GIT_PROJECT_NAME = "browser-verify-git";
const MANAGED_NON_GIT_PROJECT_NAME = "browser-verify-non-git";

function createBrowserVerificationCliConfig(
  frontend: FrontendVerificationTarget["frontend"],
  projectPath: string,
): CLIConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    frontend,
    open: false,
    watch: false,
    syncMode: "manual",
    ai: false,
    projectPath,
    promptModel: "claude-opus-4-6",
    assistantModel: "claude-opus-4-6",
    assistantAdditionalArgs: ["--dangerously-skip-permissions"],
    projectDirs: [],
  };
}

function runProcessOrThrow(
  commandArguments: readonly string[],
  cwd: string,
): void {
  const commandProcess = Bun.spawnSync([...commandArguments], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (commandProcess.exitCode !== 0) {
    const stderrText = commandProcess.stderr.toString().trim();
    const stdoutText = commandProcess.stdout.toString().trim();
    throw new Error(
      [`Command failed: ${commandArguments.join(" ")}`, stdoutText, stderrText]
        .filter((part) => part.length > 0)
        .join("\n"),
    );
  }
}

function createManagedVerificationWorkspace(): ManagedVerificationWorkspace {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), "qraftbox-browser-verification-"),
  );
  const gitProjectPath = join(workspaceRoot, MANAGED_GIT_PROJECT_NAME);
  const nonGitProjectPath = join(workspaceRoot, MANAGED_NON_GIT_PROJECT_NAME);

  mkdirSync(join(gitProjectPath, "src"), { recursive: true });
  writeFileSync(
    join(gitProjectPath, "src", "main.ts"),
    'export const message = "before";\n',
  );
  writeFileSync(join(gitProjectPath, ".gitignore"), "dist/\n");
  runProcessOrThrow(["git", "init", "--quiet"], gitProjectPath);
  runProcessOrThrow(
    ["git", "config", "user.email", "qraftbox@example.com"],
    gitProjectPath,
  );
  runProcessOrThrow(
    ["git", "config", "user.name", "QraftBox Browser Verification"],
    gitProjectPath,
  );
  runProcessOrThrow(["git", "add", "."], gitProjectPath);
  runProcessOrThrow(
    ["git", "commit", "--quiet", "-m", "Initial browser verification fixture"],
    gitProjectPath,
  );
  writeFileSync(
    join(gitProjectPath, "src", "main.ts"),
    'export const message = "after";\nconsole.log(message);\n',
  );
  writeFileSync(join(gitProjectPath, "README.md"), "# Browser verification\n");

  mkdirSync(nonGitProjectPath, { recursive: true });
  writeFileSync(
    join(nonGitProjectPath, "notes.txt"),
    "Non-git browser verification fixture.\n",
  );

  return {
    rootDir: workspaceRoot,
    gitProjectPath,
    nonGitProjectPath,
    cleanup() {
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}

function withTemporaryHome<T>(homeDir: string, run: () => T): T {
  const previousHome = process.env["HOME"];
  process.env["HOME"] = homeDir;
  try {
    return run();
  } finally {
    if (previousHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = previousHome;
    }
  }
}

async function startManagedFrontendServer(
  frontend: FrontendVerificationTarget["frontend"],
  projectPath: string,
  serverHomeDir: string,
  sharedContextManager: ReturnType<typeof createContextManager>,
  sharedRecentStore: ReturnType<typeof createRecentDirectoryStore>,
  sharedOpenTabsStore: ReturnType<typeof createInMemoryOpenTabsStore>,
  initialTabs: readonly import("../types/workspace").WorkspaceTab[],
  activeTabPath: string,
): Promise<ManagedFrontendServerHandle> {
  mkdirSync(serverHomeDir, { recursive: true });
  const app = withTemporaryHome(serverHomeDir, () =>
    createServer({
      config: createBrowserVerificationCliConfig(frontend, projectPath),
      contextManager: sharedContextManager,
      recentStore: sharedRecentStore,
      openTabsStore: sharedOpenTabsStore,
      activeTabPath,
      initialTabs,
      temporaryProjectMode: false,
    }),
  );

  const requestLog: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const requestUrl = new URL(request.url);
      if (requestUrl.pathname.startsWith("/api/")) {
        requestLog.push(`${requestUrl.pathname}${requestUrl.search}`);
      }
      return app.fetch(request);
    },
  });

  return {
    target: {
      frontend,
      baseUrl: `http://127.0.0.1:${server.port}`,
    },
    requestLog,
    stop() {
      server.stop(true);
    },
  };
}

async function startManagedVerificationServers(
  workspaceRoot: string,
  projectPath: string,
): Promise<ManagedVerificationServerSet> {
  const projectRegistry = createInMemoryProjectRegistry();
  const contextManager = createContextManager({ projectRegistry });
  const initialTab = await contextManager.createContext(projectPath, {
    persistInRegistry: false,
  });
  const recentStore = createRecentDirectoryStore({
    dbPath: join(workspaceRoot, `recent-${initialTab.projectSlug}.db`),
  });
  const openTabsStore = createInMemoryOpenTabsStore();

  const svelteHandle = await startManagedFrontendServer(
    "svelte",
    projectPath,
    join(workspaceRoot, "home-svelte"),
    contextManager,
    recentStore,
    openTabsStore,
    [initialTab],
    initialTab.path,
  );
  const solidHandle = await startManagedFrontendServer(
    "solid",
    projectPath,
    join(workspaceRoot, "home-solid"),
    contextManager,
    recentStore,
    openTabsStore,
    [initialTab],
    initialTab.path,
  );

  return {
    targets: [svelteHandle.target, solidHandle.target],
    requestLogs: {
      svelte: svelteHandle.requestLog,
      solid: solidHandle.requestLog,
    },
    stop() {
      solidHandle.stop();
      svelteHandle.stop();
    },
  };
}

export async function runManagedFrontendMigrationBrowserVerification(
  options: Pick<
    BrowserVerificationRunOptions,
    "cwd" | "commandRunner" | "recordPassed"
  > = {},
): Promise<BrowserVerificationRunResult> {
  const commandRunner = options.commandRunner ?? runAgentBrowserCommand;
  const recordPassed =
    options.recordPassed ?? recordSolidBrowserVerificationPassed;
  const workspace = createManagedVerificationWorkspace();
  const managedScenarios = listBrowserVerificationScenarios();

  try {
    for (const scenario of managedScenarios) {
      const projectPath =
        scenario.workspaceKind === "git"
          ? workspace.gitProjectPath
          : workspace.nonGitProjectPath;
      const servers = await startManagedVerificationServers(
        workspace.rootDir,
        projectPath,
      );

      try {
        for (const target of servers.targets) {
          await verifyScenarioInBrowser(
            target,
            {
              name: scenario.id,
              routeHash: scenario.routeHash,
              requiredTextSubstrings: scenario.requiredTextSubstrings,
              requiredApiPathSubstrings: scenario.requiredApiPathSubstrings,
              forbiddenApiPathSubstrings: scenario.forbiddenApiPathSubstrings,
            },
            commandRunner,
            (frontend) => servers.requestLogs[frontend],
          );
        }
      } finally {
        servers.stop();
      }
    }

    return {
      markerPath: recordPassed(options.cwd),
      targets: DEFAULT_FRONTEND_VERIFICATION_TARGETS,
    };
  } finally {
    workspace.cleanup();
  }
}

export function getBrowserVerificationUsage(): string {
  return [
    "Usage: bun run verify:frontend:migration:browser [--svelte-url <url>] [--solid-url <url>]",
    "",
    "Without explicit frontend URLs, the command starts managed Svelte and Solid verification servers against shared Git and non-Git workspace fixtures.",
    "",
    "Existing server mode:",
    "  --svelte-url http://127.0.0.1:7155",
    "  --solid-url  http://127.0.0.1:7156",
    "",
    "The command opens both frontends with agent-browser, checks the required project/files parity scenarios, captures snapshots/screenshots, and records tmp-solid-browser-verification.json on success.",
  ].join("\n");
}

async function runBrowserVerificationCli(
  args: readonly string[],
): Promise<void> {
  const parsedArgs = parseBrowserVerificationCliArgs(args);
  if (parsedArgs.showHelp) {
    console.log(getBrowserVerificationUsage());
    return;
  }

  const result = parsedArgs.useManagedSharedBackend
    ? await runManagedFrontendMigrationBrowserVerification()
    : await runFrontendMigrationBrowserVerification(parsedArgs.targets);
  console.log(result.markerPath);
}

if (import.meta.main) {
  await runBrowserVerificationCli(process.argv.slice(2));
}

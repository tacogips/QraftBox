import { afterEach, describe, expect, test } from "bun:test";
import { cancelGitAction, executeCreatePR } from "./executor";
import { processWorkerStore } from "../workers/process-worker-store.js";

interface MockSpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exited: Promise<number>;
  kill(): void;
}

function createMockSpawnResult(options: {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}): MockSpawnResult {
  return {
    stdout: options.stdout ?? "",
    stderr: options.stderr ?? "",
    exited: Promise.resolve(options.exitCode ?? 0),
    kill(): void {
      // No-op for test doubles.
    },
  };
}

const originalSpawn = Bun.spawn;

afterEach(() => {
  Bun.spawn = originalSpawn;
  processWorkerStore.clear();
});

describe("executeCreatePR", () => {
  test("fails when the AI command finishes but no pull request can be verified", async () => {
    Bun.spawn = ((command: string[]) => {
      if (command[0] === "claude") {
        return createMockSpawnResult({
          stdout: "Pull request created successfully.",
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      if (command[0] === "gh" && command[1] === "pr" && command[2] === "view") {
        return createMockSpawnResult({
          stderr: "no pull requests found for branch",
          exitCode: 1,
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      throw new Error(`Unexpected command: ${command.join(" ")}`);
    }) as typeof Bun.spawn;

    const gitActionResult = await executeCreatePR("/tmp/qraftbox-test", "main");

    expect(gitActionResult.success).toBe(false);
    expect(gitActionResult.output).toContain(
      "Pull request created successfully",
    );
    expect(gitActionResult.error).toBe(
      "Create PR command completed but no pull request exists for the current branch",
    );
  });

  test("succeeds when a pull request can be verified immediately", async () => {
    Bun.spawn = ((command: string[]) => {
      if (command[0] === "claude") {
        return createMockSpawnResult({
          stdout: "Pull request created successfully.",
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      if (command[0] === "gh" && command[1] === "pr" && command[2] === "view") {
        return createMockSpawnResult({
          stdout: JSON.stringify({
            number: 42,
            url: "https://github.com/tacogips/QraftBox/pull/42",
            title: "Add PR verification",
            body: "## Summary\n- verify PR creation",
          }),
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      throw new Error(`Unexpected command: ${command.join(" ")}`);
    }) as typeof Bun.spawn;

    const gitActionResult = await executeCreatePR("/tmp/qraftbox-test", "main");

    expect(gitActionResult.success).toBe(true);
    expect(gitActionResult.error).toBeUndefined();
    expect(gitActionResult.output).toContain(
      "Pull request created successfully",
    );
  });

  test("redacts AI prompts from recorded worker command summaries", async () => {
    Bun.spawn = ((command: string[]) => {
      if (command[0] === "claude") {
        return createMockSpawnResult({
          stdout: "Pull request created successfully.",
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      if (command[0] === "gh" && command[1] === "pr" && command[2] === "view") {
        return createMockSpawnResult({
          stdout: JSON.stringify({
            number: 42,
            url: "https://github.com/tacogips/QraftBox/pull/42",
            title: "Add PR verification",
            body: "## Summary\n- verify PR creation",
          }),
        }) as unknown as ReturnType<typeof Bun.spawn>;
      }

      throw new Error(`Unexpected command: ${command.join(" ")}`);
    }) as typeof Bun.spawn;

    const gitActionResult = await executeCreatePR("/tmp/qraftbox-test", "main");

    expect(gitActionResult.success).toBe(true);
    const latestWorker = processWorkerStore.listWorkers()[0];
    expect(latestWorker).toBeDefined();

    const workerDetail =
      latestWorker === undefined
        ? null
        : processWorkerStore.getWorker(latestWorker.id);
    const aiCommand = workerDetail?.commands.find((workerCommand) =>
      workerCommand.commandText.startsWith("claude "),
    );
    expect(aiCommand?.commandText).toContain("<prompt redacted>");
    expect(aiCommand?.commandText).not.toContain("Base branch for PR: main");
  });

  test("returns false when cancelling a completed or unknown worker", async () => {
    processWorkerStore.createWorker({
      workerId: "completed-worker",
      title: "git push",
      projectPath: "/repo",
      phase: "pushing",
      source: "git",
      canCancel: false,
    });
    processWorkerStore.completeWorker("completed-worker", {
      status: "completed",
    });

    await expect(cancelGitAction("completed-worker")).resolves.toBe(false);
    await expect(cancelGitAction("missing-worker")).resolves.toBe(false);
  });
});

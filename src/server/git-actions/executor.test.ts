import { afterEach, describe, expect, test } from "bun:test";
import { executeCreatePR } from "./executor";

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
});

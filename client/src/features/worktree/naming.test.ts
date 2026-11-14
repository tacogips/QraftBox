import { describe, expect, test } from "bun:test";
import { suggestDefaultWorktreeName } from "./naming";

describe("suggestDefaultWorktreeName", () => {
  test("starts from wt-1 when no additional worktrees exist", () => {
    expect(
      suggestDefaultWorktreeName([
        {
          path: "/repos/alpha",
          head: "abc123",
          branch: "main",
          isMain: true,
          locked: false,
          prunable: false,
          mainRepositoryPath: "/repos/alpha",
        },
      ]),
    ).toBe("wt-1");
  });

  test("returns the first unused wt-{n} suffix", () => {
    expect(
      suggestDefaultWorktreeName([
        {
          path: "/repos/alpha",
          head: "abc123",
          branch: "main",
          isMain: true,
          locked: false,
          prunable: false,
          mainRepositoryPath: "/repos/alpha",
        },
        {
          path: "/var/tmp/qraftbox/worktrees/alpha/wt-1",
          head: "def456",
          branch: "wt-1",
          isMain: false,
          locked: false,
          prunable: false,
          mainRepositoryPath: "/repos/alpha",
        },
        {
          path: "/var/tmp/qraftbox/worktrees/alpha/wt-3/",
          head: "ghi789",
          branch: "wt-3",
          isMain: false,
          locked: false,
          prunable: false,
          mainRepositoryPath: "/repos/alpha",
        },
      ]),
    ).toBe("wt-2");
  });
});

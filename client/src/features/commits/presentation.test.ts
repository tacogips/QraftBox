import { describe, expect, test } from "bun:test";
import {
  collectCommitDiffPreviewLines,
  formatCommitRelativeDate,
  formatCommitStatusLabel,
  getCommitHeadline,
  getCommitListSummary,
} from "./presentation";

describe("commit presentation helpers", () => {
  test("maps commit status codes to labels", () => {
    expect(formatCommitStatusLabel("A")).toBe("Added");
    expect(formatCommitStatusLabel("R")).toBe("Renamed");
  });

  test("extracts the first line of a commit message", () => {
    expect(getCommitHeadline("Fix stale diff\n\nDetailed body")).toBe(
      "Fix stale diff",
    );
  });

  test("summarizes the loaded commit list", () => {
    expect(getCommitListSummary([], false)).toBe("No commits loaded");
    expect(
      getCommitListSummary(
        [
          {
            hash: "abc1234",
            shortHash: "abc1234",
            message: "Fix stale diff",
            body: "",
            author: { name: "Taco", email: "taco@example.com" },
            committer: { name: "Taco", email: "taco@example.com" },
            date: 1_741_478_400_000,
            parentHashes: [],
          },
        ],
        true,
      ),
    ).toBe("1 commit (more available)");
  });

  test("renders compact diff preview lines", () => {
    expect(
      collectCommitDiffPreviewLines([
        {
          path: "src/app.ts",
          status: "modified",
          additions: 4,
          deletions: 1,
          isBinary: false,
          chunks: [
            {
              header: "@@ -1,2 +1,3 @@",
              oldStart: 1,
              oldLines: 2,
              newStart: 1,
              newLines: 3,
              changes: [
                {
                  type: "context",
                  content: "const a = 1;",
                  oldLine: 1,
                  newLine: 1,
                },
                { type: "add", content: "const b = 2;", newLine: 2 },
              ],
            },
          ],
        },
      ]),
    ).toEqual([
      "src/app.ts | modified | +4 | -1",
      "@@ -1,2 +1,3 @@",
      " 1: const a = 1;",
      "+2: const b = 2;",
    ]);
  });

  test("formats relative dates for recent commits", () => {
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    expect(formatCommitRelativeDate(thirtyMinutesAgo)).toBe("30 min ago");
  });
});

import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { executeSearch, getFilesForScope } from "./index";

const execAsync = promisify(execCallback);

describe("search service", () => {
  let repositoryPath = "";

  beforeAll(async () => {
    repositoryPath = await mkdtemp(join(tmpdir(), "qraftbox-search-test-"));
    await execAsync("git init", { cwd: repositoryPath });
    await execAsync('git config user.email "test@example.com"', {
      cwd: repositoryPath,
    });
    await execAsync('git config user.name "Test User"', {
      cwd: repositoryPath,
    });

    await writeFile(
      join(repositoryPath, ".gitignore"),
      ["ignored.log", "ignored-dir/"].join("\n"),
    );
    await writeFile(
      join(repositoryPath, "tracked.txt"),
      "tracked line\nshared search token\n",
    );
    await writeFile(join(repositoryPath, "stable.txt"), "stable line\n");
    await execAsync("git add .", { cwd: repositoryPath });
    await execAsync('git commit -m "Initial commit"', { cwd: repositoryPath });

    await writeFile(
      join(repositoryPath, "tracked.txt"),
      "modified line\nshared search token\n",
    );
    await writeFile(
      join(repositoryPath, "untracked.txt"),
      "untracked search token\n",
    );
    await writeFile(join(repositoryPath, "ignored.log"), "ignored token\n");
    await mkdir(join(repositoryPath, "ignored-dir"), { recursive: true });
    await writeFile(
      join(repositoryPath, "ignored-dir", "nested.txt"),
      "nested ignored token\n",
    );
  });

  afterAll(async () => {
    if (repositoryPath.length > 0) {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  test("lists changed files from git status", async () => {
    const changedFiles = await getFilesForScope(
      "changed",
      undefined,
      { type: "working" },
      repositoryPath,
      {
        showIgnored: false,
        showAllFiles: false,
      },
    );

    expect(changedFiles).toContain("tracked.txt");
    expect(changedFiles).toContain("untracked.txt");
    expect(changedFiles).not.toContain("stable.txt");
  });

  test("lists tracked and untracked files for all scope by default", async () => {
    const allFiles = await getFilesForScope(
      "all",
      undefined,
      { type: "working" },
      repositoryPath,
      {
        showIgnored: false,
        showAllFiles: false,
      },
    );

    expect(allFiles).toContain("tracked.txt");
    expect(allFiles).toContain("stable.txt");
    expect(allFiles).toContain("untracked.txt");
    expect(allFiles).not.toContain("ignored.log");
  });

  test("includes ignored files when requested", async () => {
    const allFiles = await getFilesForScope(
      "all",
      undefined,
      { type: "working" },
      repositoryPath,
      {
        showIgnored: true,
        showAllFiles: false,
      },
    );

    expect(allFiles).toContain("ignored.log");
    expect(allFiles).toContain("ignored-dir/nested.txt");
  });

  test("executes changed-file search with git-backed scope selection", async () => {
    const searchResponse = await executeSearch(
      "changed",
      undefined,
      { type: "working" },
      repositoryPath,
      {
        pattern: "search token",
        showIgnored: false,
        showAllFiles: false,
      },
      async (filePath: string) => Bun.file(filePath).text(),
    );

    expect(searchResponse.filesSearched).toBeGreaterThanOrEqual(2);
    expect(
      searchResponse.results.some(
        (searchResult) => searchResult.filePath === "tracked.txt",
      ),
    ).toBeTrue();
    expect(
      searchResponse.results.some(
        (searchResult) => searchResult.filePath === "untracked.txt",
      ),
    ).toBeTrue();
  });

  test("excludes matching file names before executing search", async () => {
    const searchResponse = await executeSearch(
      "all",
      undefined,
      { type: "working" },
      repositoryPath,
      {
        pattern: "search token",
        excludeFileNames: ["tracked.txt"],
        showIgnored: false,
        showAllFiles: false,
      },
      async (filePath: string) => Bun.file(filePath).text(),
    );

    expect(searchResponse.filesSearched).toBeGreaterThanOrEqual(2);
    expect(
      searchResponse.results.some(
        (searchResult) => searchResult.filePath === "tracked.txt",
      ),
    ).toBeFalse();
    expect(
      searchResponse.results.some(
        (searchResult) => searchResult.filePath === "untracked.txt",
      ),
    ).toBeTrue();
  });
});

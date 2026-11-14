import { describe, expect, test, vi } from "vitest";
import { createFilesApiClient } from "./files";

describe("shared files api", () => {
  test("normalizes the full-tree response into shared file-tree nodes", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tree: {
            name: "",
            path: "",
            type: "directory",
            children: [
              {
                name: "src",
                path: "src",
                type: "directory",
              },
            ],
          },
          totalFiles: 12,
          changedFiles: 4,
        }),
      ),
    );
    const filesApiClient = createFilesApiClient({ fetchImplementation });

    await expect(
      filesApiClient.fetchAllFilesTree("ctx-1", true, {
        showIgnored: true,
      }),
    ).resolves.toEqual({
      tree: {
        name: "",
        path: "",
        isDirectory: true,
        children: [
          {
            name: "src",
            path: "src",
            isDirectory: true,
            status: undefined,
            isBinary: undefined,
          },
        ],
        status: undefined,
        isBinary: undefined,
      },
      totalFiles: 12,
      changedFiles: 4,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/ctx/ctx-1/files?mode=all&shallow=true&showIgnored=true",
    );
  });

  test("returns converted directory children", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          children: [
            {
              name: "main.ts",
              path: "src/main.ts",
              type: "file",
              status: "modified",
            },
          ],
        }),
      ),
    );
    const filesApiClient = createFilesApiClient({ fetchImplementation });

    await expect(
      filesApiClient.fetchDirectoryChildren("ctx-2", "src", {
        showAllFiles: true,
      }),
    ).resolves.toEqual([
      {
        name: "main.ts",
        path: "src/main.ts",
        isDirectory: false,
        status: "modified",
        isBinary: undefined,
      },
    ]);
  });

  test("returns file content payloads and surfaces server errors", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            path: "README.md",
            content: "# QraftBox",
            language: "markdown",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "missing file" }), {
          status: 404,
        }),
      );
    const filesApiClient = createFilesApiClient({ fetchImplementation });

    await expect(
      filesApiClient.fetchFileContent("ctx-3", "README.md"),
    ).resolves.toEqual({
      path: "README.md",
      content: "# QraftBox",
      language: "markdown",
    });
    await expect(
      filesApiClient.fetchFileContent("ctx-3", "missing.md"),
    ).rejects.toThrow("missing file");
  });
});

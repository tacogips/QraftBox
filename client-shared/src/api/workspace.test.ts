import { describe, expect, test, vi } from "vitest";
import {
  activateWorkspaceTab,
  closeWorkspaceTab,
  createWorkspaceApiClient,
  fetchRecentProjects,
  pickDirectory,
  fetchWorkspaceShellState,
  fetchWorkspaceSnapshot,
  openWorkspaceTab,
  openWorkspaceTabBySlug,
  removeRecentProject,
} from "./workspace";

describe("shared workspace api", () => {
  test("normalizes the workspace snapshot from the server payload", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspace: {
            tabs: [
              {
                id: "ctx-1",
                path: "/repos/alpha",
                name: "alpha",
                isGitRepo: true,
                projectSlug: "alpha",
              },
            ],
            activeTabId: "ctx-1",
          },
        }),
      ),
    );

    await expect(fetchWorkspaceSnapshot(fetchImplementation)).resolves.toEqual({
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      activeTabId: "ctx-1",
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
  });

  test("returns recent projects from the server response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          recent: [
            {
              path: "/repos/alpha",
              name: "alpha",
              isGitRepo: true,
            },
          ],
        }),
      ),
    );

    await expect(fetchRecentProjects(fetchImplementation)).resolves.toEqual([
      {
        path: "/repos/alpha",
        name: "alpha",
        isGitRepo: true,
      },
    ]);
  });

  test("builds a workspace shell state from live workspace and recents", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace: {
              tabs: [
                {
                  id: "ctx-1",
                  path: "/repos/alpha",
                  name: "alpha",
                  isGitRepo: true,
                  projectSlug: "alpha",
                },
              ],
              activeTabId: null,
            },
            metadata: {
              temporaryProjectMode: true,
              canManageProjects: false,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recent: [
              {
                path: "/repos/beta",
                name: "beta",
                isGitRepo: true,
              },
            ],
          }),
        ),
      );

    await expect(
      fetchWorkspaceShellState(fetchImplementation),
    ).resolves.toEqual({
      activeContextId: "ctx-1",
      openContextIds: ["ctx-1"],
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      recentProjects: [
        {
          path: "/repos/beta",
          name: "beta",
          isGitRepo: true,
        },
      ],
      activeProjectPath: "/repos/alpha",
      canManageProjects: false,
      temporaryProjectMode: true,
      isEmpty: false,
    });
  });

  test("fails fast when the workspace request fails", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("", {
        status: 503,
      }),
    );

    await expect(fetchWorkspaceSnapshot(fetchImplementation)).rejects.toThrow(
      "Failed to fetch workspace: 503",
    );
  });

  test("activates a workspace tab and normalizes the updated snapshot", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspace: {
            tabs: [
              {
                id: "ctx-1",
                path: "/repos/alpha",
                name: "alpha",
                isGitRepo: true,
                projectSlug: "alpha",
              },
            ],
            activeTabId: "ctx-1",
          },
        }),
      ),
    );

    await expect(
      activateWorkspaceTab("ctx-1", fetchImplementation),
    ).resolves.toEqual({
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      activeTabId: "ctx-1",
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
  });

  test("opens a workspace tab by path and returns the opened tab with snapshot", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tab: {
            id: "ctx-2",
            path: "/repos/beta",
            name: "beta",
            isGitRepo: true,
            projectSlug: "beta",
          },
          workspace: {
            tabs: [
              {
                id: "ctx-2",
                path: "/repos/beta",
                name: "beta",
                isGitRepo: true,
                projectSlug: "beta",
              },
            ],
            activeTabId: "ctx-2",
          },
        }),
      ),
    );

    await expect(
      openWorkspaceTab("/repos/beta", fetchImplementation),
    ).resolves.toEqual({
      tab: {
        id: "ctx-2",
        path: "/repos/beta",
        name: "beta",
        isGitRepo: true,
        projectSlug: "beta",
      },
      workspaceSnapshot: {
        tabs: [
          {
            id: "ctx-2",
            path: "/repos/beta",
            name: "beta",
            isGitRepo: true,
            projectSlug: "beta",
          },
        ],
        activeTabId: "ctx-2",
        metadata: {
          temporaryProjectMode: false,
          canManageProjects: true,
        },
      },
    });
  });

  test("opens the directory picker with the requested start path", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          path: "/repos/selected",
        }),
      ),
    );

    await expect(
      pickDirectory("/repos/current", fetchImplementation),
    ).resolves.toBe("/repos/selected");

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/browse/pick-directory",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPath: "/repos/current" }),
      },
    );
  });

  test("supports a cancelled directory picker response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          path: null,
        }),
      ),
    );

    await expect(pickDirectory(undefined, fetchImplementation)).resolves.toBe(
      null,
    );
  });

  test("opens a workspace tab by slug and uses server error messages", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "Unknown project slug: missing",
        }),
        { status: 404 },
      ),
    );

    await expect(
      openWorkspaceTabBySlug("missing", fetchImplementation),
    ).rejects.toThrow("Unknown project slug: missing");
  });

  test("closes a workspace tab and normalizes the updated snapshot", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspace: {
            tabs: [],
            activeTabId: null,
          },
        }),
      ),
    );

    await expect(
      closeWorkspaceTab("ctx-1", fetchImplementation),
    ).resolves.toEqual({
      tabs: [],
      activeTabId: null,
      metadata: {
        temporaryProjectMode: false,
        canManageProjects: true,
      },
    });
  });

  test("removes a recent project", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    await expect(
      removeRecentProject("/repos/alpha", fetchImplementation),
    ).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith("/api/workspace/recent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/repos/alpha" }),
    });
  });

  test("supports a configurable API base URL for shared workspace requests", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace: {
              tabs: [
                {
                  id: "ctx-1",
                  path: "/repos/alpha",
                  name: "alpha",
                  isGitRepo: true,
                  projectSlug: "alpha",
                },
              ],
              activeTabId: "ctx-1",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recent: [
              {
                path: "/repos/beta",
                name: "beta",
                isGitRepo: true,
              },
            ],
          }),
        ),
      );

    const workspaceApi = createWorkspaceApiClient({
      fetchImplementation,
      apiBaseUrl: "http://localhost:7144/custom-api/",
    });

    await expect(workspaceApi.fetchWorkspaceShellState()).resolves.toEqual({
      activeContextId: "ctx-1",
      openContextIds: ["ctx-1"],
      tabs: [
        {
          id: "ctx-1",
          path: "/repos/alpha",
          name: "alpha",
          isGitRepo: true,
          projectSlug: "alpha",
        },
      ],
      recentProjects: [
        {
          path: "/repos/beta",
          name: "beta",
          isGitRepo: true,
        },
      ],
      activeProjectPath: "/repos/alpha",
      canManageProjects: true,
      temporaryProjectMode: false,
      isEmpty: false,
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://localhost:7144/custom-api/workspace",
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "http://localhost:7144/custom-api/workspace/recent",
    );
  });

  test("uses the configured API base URL for slug-based workspace opens", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tab: {
            id: "ctx-2",
            path: "/repos/feature/space project",
            name: "space project",
            isGitRepo: true,
            projectSlug: "feature/space project",
          },
          workspace: {
            tabs: [
              {
                id: "ctx-2",
                path: "/repos/feature/space project",
                name: "space project",
                isGitRepo: true,
                projectSlug: "feature/space project",
              },
            ],
            activeTabId: "ctx-2",
          },
        }),
      ),
    );

    const workspaceApi = createWorkspaceApiClient({
      fetchImplementation,
      apiBaseUrl: "/custom-api",
    });

    await workspaceApi.openWorkspaceTabBySlug("feature/space project");

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/custom-api/workspace/tabs/by-slug/feature%2Fspace%20project",
      {
        method: "POST",
      },
    );
  });
});

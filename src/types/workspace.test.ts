import { describe, test, expect } from "bun:test";
import {
  createEmptyWorkspace,
  createWorkspaceTab,
  updateTabAccessTime,
  validateTabParams,
  validateDirectoryPath,
  validateContextId,
  isWorkspaceFull,
  findTabById,
  findTabByPath,
  getActiveTab,
  sortDirectoryEntries,
  filterHiddenEntries,
  sortRecentDirectories,
  type ContextId,
  type WorkspaceTab,
  type Workspace,
  type DirectoryEntry,
  type RecentDirectory,
} from "./workspace";

describe("createEmptyWorkspace", () => {
  test("creates empty workspace with default maxTabs", () => {
    const workspace = createEmptyWorkspace();
    expect(workspace.tabs).toHaveLength(0);
    expect(workspace.activeTabId).toBeNull();
    expect(workspace.maxTabs).toBe(10);
  });

  test("creates empty workspace with custom maxTabs", () => {
    const workspace = createEmptyWorkspace(20);
    expect(workspace.maxTabs).toBe(20);
  });

  test("throws error if maxTabs less than 1", () => {
    expect(() => createEmptyWorkspace(0)).toThrow("maxTabs must be at least 1");
    expect(() => createEmptyWorkspace(-5)).toThrow(
      "maxTabs must be at least 1",
    );
  });

  test("throws error if maxTabs exceeds 50", () => {
    expect(() => createEmptyWorkspace(51)).toThrow(
      "maxTabs must not exceed 50",
    );
    expect(() => createEmptyWorkspace(100)).toThrow(
      "maxTabs must not exceed 50",
    );
  });

  test("accepts maxTabs at boundaries", () => {
    expect(() => createEmptyWorkspace(1)).not.toThrow();
    expect(() => createEmptyWorkspace(50)).not.toThrow();
  });
});

describe("createWorkspaceTab", () => {
  test("creates tab with all required fields", () => {
    const tab = createWorkspaceTab(
      "/home/user/project",
      "project",
      "/home/user/project",
      true,
    );

    expect(tab.id).toBeDefined();
    expect(tab.path).toBe("/home/user/project");
    expect(tab.name).toBe("project");
    expect(tab.repositoryRoot).toBe("/home/user/project");
    expect(tab.isGitRepo).toBe(true);
    expect(tab.createdAt).toBeDefined();
    expect(tab.lastAccessedAt).toBe(tab.createdAt);
  });

  test("creates tab for non-git directory", () => {
    const tab = createWorkspaceTab(
      "/home/user/docs",
      "docs",
      "/home/user/docs",
      false,
    );

    expect(tab.isGitRepo).toBe(false);
  });

  test("generates unique IDs for different tabs", () => {
    const tab1 = createWorkspaceTab("/path1", "name1", "/path1", false);
    const tab2 = createWorkspaceTab("/path2", "name2", "/path2", false);

    expect(tab1.id).not.toBe(tab2.id);
  });

  test("sets createdAt and lastAccessedAt to same value", () => {
    const tab = createWorkspaceTab("/path", "name", "/path", false);

    expect(tab.createdAt).toBe(tab.lastAccessedAt);
  });
});

describe("updateTabAccessTime", () => {
  test("updates lastAccessedAt while preserving other fields", () => {
    const originalTab = createWorkspaceTab("/path", "name", "/path", true);

    // Wait a bit to ensure time difference
    const updatedTab = updateTabAccessTime(originalTab);

    expect(updatedTab.id).toBe(originalTab.id);
    expect(updatedTab.path).toBe(originalTab.path);
    expect(updatedTab.name).toBe(originalTab.name);
    expect(updatedTab.repositoryRoot).toBe(originalTab.repositoryRoot);
    expect(updatedTab.isGitRepo).toBe(originalTab.isGitRepo);
    expect(updatedTab.createdAt).toBe(originalTab.createdAt);
    expect(updatedTab.lastAccessedAt).toBeGreaterThanOrEqual(
      originalTab.lastAccessedAt,
    );
  });
});

describe("validateTabParams", () => {
  test("accepts valid parameters", () => {
    const result = validateTabParams(
      "/home/user/project",
      "project",
      "/home/user/project",
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects empty path", () => {
    const result = validateTabParams("", "name", "/root");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path cannot be empty");
  });

  test("rejects path with only whitespace", () => {
    const result = validateTabParams("   ", "name", "/root");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path cannot be empty");
  });

  test("rejects empty name", () => {
    const result = validateTabParams("/path", "", "/path");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("name cannot be empty");
  });

  test("rejects name with only whitespace", () => {
    const result = validateTabParams("/path", "   ", "/path");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("name cannot be empty");
  });

  test("rejects name exceeding 100 characters", () => {
    const longName = "a".repeat(101);
    const result = validateTabParams("/path", longName, "/path");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("name must not exceed 100 characters");
  });

  test("accepts name at 100 characters", () => {
    const name = "a".repeat(100);
    const result = validateTabParams("/path", name, "/path");
    expect(result.valid).toBe(true);
  });

  test("rejects empty repositoryRoot", () => {
    const result = validateTabParams("/path", "name", "");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("repositoryRoot cannot be empty");
  });

  test("rejects repositoryRoot with only whitespace", () => {
    const result = validateTabParams("/path", "name", "   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("repositoryRoot cannot be empty");
  });
});

describe("validateDirectoryPath", () => {
  test("accepts valid absolute path", () => {
    const result = validateDirectoryPath("/home/user/project");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts valid relative path", () => {
    const result = validateDirectoryPath("./src/components");
    expect(result.valid).toBe(true);
  });

  test("rejects empty path", () => {
    const result = validateDirectoryPath("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path cannot be empty");
  });

  test("rejects path with only whitespace", () => {
    const result = validateDirectoryPath("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path cannot be empty");
  });

  test("rejects path exceeding 4096 characters", () => {
    const longPath = "/a".repeat(2049); // 4098 characters
    const result = validateDirectoryPath(longPath);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path exceeds maximum length of 4096 characters");
  });

  test("accepts path at 4096 characters", () => {
    const path = "/a".repeat(2048); // Exactly 4096 characters
    const result = validateDirectoryPath(path);
    expect(result.valid).toBe(true);
  });

  test("rejects path with null byte (security)", () => {
    const result = validateDirectoryPath("/home/user\0/project");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("path contains invalid null byte");
  });
});

describe("validateContextId", () => {
  test("accepts valid UUID", () => {
    const id = crypto.randomUUID();
    const result = validateContextId(id);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts UUID with uppercase", () => {
    const result = validateContextId("A1B2C3D4-E5F6-4789-ABCD-0123456789AB");
    expect(result.valid).toBe(true);
  });

  test("accepts UUID with lowercase", () => {
    const result = validateContextId("a1b2c3d4-e5f6-4789-abcd-0123456789ab");
    expect(result.valid).toBe(true);
  });

  test("rejects empty context ID", () => {
    const result = validateContextId("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("context ID cannot be empty");
  });

  test("rejects context ID with only whitespace", () => {
    const result = validateContextId("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("context ID cannot be empty");
  });

  test("rejects invalid UUID format", () => {
    expect(validateContextId("not-a-uuid").valid).toBe(false);
    expect(validateContextId("12345678-1234-1234-1234").valid).toBe(false); // Too short
    expect(
      validateContextId("12345678-1234-1234-1234-12345678901g").valid,
    ).toBe(false); // Invalid hex
    expect(validateContextId("12345678123412341234123456789012").valid).toBe(
      false,
    ); // Missing dashes
  });
});

describe("isWorkspaceFull", () => {
  test("returns false for empty workspace", () => {
    const workspace = createEmptyWorkspace(5);
    expect(isWorkspaceFull(workspace)).toBe(false);
  });

  test("returns false when workspace has space", () => {
    const workspace: Workspace = {
      tabs: [
        createWorkspaceTab("/path1", "tab1", "/path1", false),
        createWorkspaceTab("/path2", "tab2", "/path2", false),
      ],
      activeTabId: null,
      maxTabs: 5,
    };
    expect(isWorkspaceFull(workspace)).toBe(false);
  });

  test("returns true when workspace is at capacity", () => {
    const workspace: Workspace = {
      tabs: [
        createWorkspaceTab("/path1", "tab1", "/path1", false),
        createWorkspaceTab("/path2", "tab2", "/path2", false),
        createWorkspaceTab("/path3", "tab3", "/path3", false),
      ],
      activeTabId: null,
      maxTabs: 3,
    };
    expect(isWorkspaceFull(workspace)).toBe(true);
  });

  test("returns true when workspace exceeds capacity", () => {
    // Edge case that shouldn't happen but should handle
    const workspace: Workspace = {
      tabs: [
        createWorkspaceTab("/path1", "tab1", "/path1", false),
        createWorkspaceTab("/path2", "tab2", "/path2", false),
        createWorkspaceTab("/path3", "tab3", "/path3", false),
      ],
      activeTabId: null,
      maxTabs: 2,
    };
    expect(isWorkspaceFull(workspace)).toBe(true);
  });
});

describe("findTabById", () => {
  const tab1 = createWorkspaceTab("/path1", "tab1", "/path1", false);
  const tab2 = createWorkspaceTab("/path2", "tab2", "/path2", false);
  const tab3 = createWorkspaceTab("/path3", "tab3", "/path3", true);

  const workspace: Workspace = {
    tabs: [tab1, tab2, tab3],
    activeTabId: tab1.id,
    maxTabs: 10,
  };

  test("finds tab by valid ID", () => {
    const found = findTabById(workspace, tab2.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(tab2.id);
    expect(found?.path).toBe("/path2");
  });

  test("returns undefined for non-existent ID", () => {
    const found = findTabById(workspace, crypto.randomUUID());
    expect(found).toBeUndefined();
  });

  test("returns undefined for empty workspace", () => {
    const emptyWorkspace = createEmptyWorkspace();
    const found = findTabById(emptyWorkspace, tab1.id);
    expect(found).toBeUndefined();
  });
});

describe("findTabByPath", () => {
  const tab1 = createWorkspaceTab("/path1", "tab1", "/path1", false);
  const tab2 = createWorkspaceTab("/path2", "tab2", "/path2", false);
  const tab3 = createWorkspaceTab("/path3", "tab3", "/path3", true);

  const workspace: Workspace = {
    tabs: [tab1, tab2, tab3],
    activeTabId: tab1.id,
    maxTabs: 10,
  };

  test("finds tab by valid path", () => {
    const found = findTabByPath(workspace, "/path2");
    expect(found).toBeDefined();
    expect(found?.id).toBe(tab2.id);
    expect(found?.path).toBe("/path2");
  });

  test("returns undefined for non-existent path", () => {
    const found = findTabByPath(workspace, "/nonexistent");
    expect(found).toBeUndefined();
  });

  test("returns undefined for empty workspace", () => {
    const emptyWorkspace = createEmptyWorkspace();
    const found = findTabByPath(emptyWorkspace, "/path1");
    expect(found).toBeUndefined();
  });

  test("path matching is exact", () => {
    const found = findTabByPath(workspace, "/path"); // Prefix match should fail
    expect(found).toBeUndefined();
  });
});

describe("getActiveTab", () => {
  test("returns active tab when one is set", () => {
    const tab1 = createWorkspaceTab("/path1", "tab1", "/path1", false);
    const tab2 = createWorkspaceTab("/path2", "tab2", "/path2", false);

    const workspace: Workspace = {
      tabs: [tab1, tab2],
      activeTabId: tab2.id,
      maxTabs: 10,
    };

    const active = getActiveTab(workspace);
    expect(active).toBeDefined();
    expect(active?.id).toBe(tab2.id);
  });

  test("returns undefined when no active tab", () => {
    const tab1 = createWorkspaceTab("/path1", "tab1", "/path1", false);

    const workspace: Workspace = {
      tabs: [tab1],
      activeTabId: null,
      maxTabs: 10,
    };

    const active = getActiveTab(workspace);
    expect(active).toBeUndefined();
  });

  test("returns undefined for empty workspace", () => {
    const workspace = createEmptyWorkspace();
    const active = getActiveTab(workspace);
    expect(active).toBeUndefined();
  });

  test("returns undefined when activeTabId does not exist in tabs", () => {
    const tab1 = createWorkspaceTab("/path1", "tab1", "/path1", false);

    const workspace: Workspace = {
      tabs: [tab1],
      activeTabId: crypto.randomUUID(), // Non-existent ID
      maxTabs: 10,
    };

    const active = getActiveTab(workspace);
    expect(active).toBeUndefined();
  });
});

describe("sortDirectoryEntries", () => {
  test("sorts directories before files", () => {
    const entries: DirectoryEntry[] = [
      {
        name: "file1.txt",
        path: "/path/file1.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "dir1",
        path: "/path/dir1",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "file2.txt",
        path: "/path/file2.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
    ];

    const sorted = sortDirectoryEntries(entries);

    expect(sorted[0]?.name).toBe("dir1");
    expect(sorted[0]?.isDirectory).toBe(true);
    expect(sorted[1]?.name).toBe("file1.txt");
    expect(sorted[2]?.name).toBe("file2.txt");
  });

  test("sorts alphabetically within directories and files", () => {
    const entries: DirectoryEntry[] = [
      {
        name: "zebra.txt",
        path: "/path/zebra.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "dirB",
        path: "/path/dirB",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "alpha.txt",
        path: "/path/alpha.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "dirA",
        path: "/path/dirA",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
    ];

    const sorted = sortDirectoryEntries(entries);

    expect(sorted[0]?.name).toBe("dirA");
    expect(sorted[1]?.name).toBe("dirB");
    expect(sorted[2]?.name).toBe("alpha.txt");
    expect(sorted[3]?.name).toBe("zebra.txt");
  });

  test("sorts case-insensitively", () => {
    const entries: DirectoryEntry[] = [
      {
        name: "Zebra.txt",
        path: "/path/Zebra.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "alpha.txt",
        path: "/path/alpha.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "Beta.txt",
        path: "/path/Beta.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
    ];

    const sorted = sortDirectoryEntries(entries);

    expect(sorted[0]?.name).toBe("alpha.txt");
    expect(sorted[1]?.name).toBe("Beta.txt");
    expect(sorted[2]?.name).toBe("Zebra.txt");
  });

  test("does not modify original array", () => {
    const entries: DirectoryEntry[] = [
      {
        name: "file.txt",
        path: "/path/file.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "dir",
        path: "/path/dir",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
    ];

    const originalFirst = entries[0];
    if (originalFirst === undefined) {
      throw new Error("Expected entries[0] to be defined");
    }
    sortDirectoryEntries(entries);

    expect(entries[0]).toBe(originalFirst); // Original unchanged
  });

  test("handles empty array", () => {
    const sorted = sortDirectoryEntries([]);
    expect(sorted).toHaveLength(0);
  });
});

describe("filterHiddenEntries", () => {
  test("filters out hidden entries", () => {
    const entries: DirectoryEntry[] = [
      {
        name: ".hidden",
        path: "/path/.hidden",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      },
      {
        name: "visible.txt",
        path: "/path/visible.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: ".git",
        path: "/path/.git",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      },
    ];

    const filtered = filterHiddenEntries(entries);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("visible.txt");
  });

  test("returns all entries when none are hidden", () => {
    const entries: DirectoryEntry[] = [
      {
        name: "file1.txt",
        path: "/path/file1.txt",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
      {
        name: "dir1",
        path: "/path/dir1",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: false,
        modifiedAt: Date.now(),
      },
    ];

    const filtered = filterHiddenEntries(entries);

    expect(filtered).toHaveLength(2);
  });

  test("returns empty array when all entries are hidden", () => {
    const entries: DirectoryEntry[] = [
      {
        name: ".hidden1",
        path: "/path/.hidden1",
        isDirectory: false,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      },
      {
        name: ".hidden2",
        path: "/path/.hidden2",
        isDirectory: true,
        isGitRepo: false,
        isSymlink: false,
        isHidden: true,
        modifiedAt: Date.now(),
      },
    ];

    const filtered = filterHiddenEntries(entries);

    expect(filtered).toHaveLength(0);
  });

  test("handles empty array", () => {
    const filtered = filterHiddenEntries([]);
    expect(filtered).toHaveLength(0);
  });
});

describe("sortRecentDirectories", () => {
  test("sorts by lastOpened descending (most recent first)", () => {
    const recent: RecentDirectory[] = [
      {
        path: "/path1",
        name: "dir1",
        lastOpened: 1000,
        isGitRepo: false,
      },
      {
        path: "/path2",
        name: "dir2",
        lastOpened: 3000,
        isGitRepo: true,
      },
      {
        path: "/path3",
        name: "dir3",
        lastOpened: 2000,
        isGitRepo: false,
      },
    ];

    const sorted = sortRecentDirectories(recent);

    expect(sorted[0]?.lastOpened).toBe(3000);
    expect(sorted[1]?.lastOpened).toBe(2000);
    expect(sorted[2]?.lastOpened).toBe(1000);
  });

  test("does not modify original array", () => {
    const recent: RecentDirectory[] = [
      {
        path: "/path1",
        name: "dir1",
        lastOpened: 1000,
        isGitRepo: false,
      },
      {
        path: "/path2",
        name: "dir2",
        lastOpened: 2000,
        isGitRepo: true,
      },
    ];

    const originalFirst = recent[0];
    if (originalFirst === undefined) {
      throw new Error("Expected recent[0] to be defined");
    }
    sortRecentDirectories(recent);

    expect(recent[0]).toBe(originalFirst); // Original unchanged
  });

  test("handles empty array", () => {
    const sorted = sortRecentDirectories([]);
    expect(sorted).toHaveLength(0);
  });

  test("handles single item", () => {
    const recent: RecentDirectory[] = [
      {
        path: "/path1",
        name: "dir1",
        lastOpened: 1000,
        isGitRepo: false,
      },
    ];

    const sorted = sortRecentDirectories(recent);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.path).toBe("/path1");
  });
});

describe("Type definitions", () => {
  test("WorkspaceTab type structure", () => {
    const tab: WorkspaceTab = {
      id: crypto.randomUUID(),
      path: "/home/user/project",
      name: "project",
      repositoryRoot: "/home/user/project",
      isGitRepo: true,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      isWorktree: false,
      mainRepositoryPath: null,
      worktreeName: null,
    };
    expect(tab).toBeDefined();
  });

  test("Workspace type structure", () => {
    const workspace: Workspace = {
      tabs: [],
      activeTabId: null,
      maxTabs: 10,
    };
    expect(workspace).toBeDefined();
  });

  test("DirectoryEntry type structure", () => {
    const entry: DirectoryEntry = {
      name: "file.txt",
      path: "/path/file.txt",
      isDirectory: false,
      isGitRepo: false,
      isSymlink: false,
      isHidden: false,
      modifiedAt: Date.now(),
    };
    expect(entry).toBeDefined();
  });

  test("RecentDirectory type structure", () => {
    const recent: RecentDirectory = {
      path: "/home/user/project",
      name: "project",
      lastOpened: Date.now(),
      isGitRepo: true,
    };
    expect(recent).toBeDefined();
  });

  test("ContextId is string", () => {
    const id: ContextId = crypto.randomUUID();
    expect(typeof id).toBe("string");
  });
});

describe("Worktree support", () => {
  describe("createWorkspaceTab with worktree fields", () => {
    test("creates non-worktree tab with default worktree fields", () => {
      const tab = createWorkspaceTab(
        "/home/user/project",
        "project",
        "/home/user/project",
        true,
      );

      expect(tab.isWorktree).toBe(false);
      expect(tab.mainRepositoryPath).toBeNull();
      expect(tab.worktreeName).toBeNull();
    });

    test("creates worktree tab with all worktree fields", () => {
      const tab = createWorkspaceTab(
        "/home/user/.local/qraftbox/worktrees/home__user__project/feature-auth",
        "feature-auth",
        "/home/user/.local/qraftbox/worktrees/home__user__project/feature-auth",
        true,
        true,
        "/home/user/project",
        "feature-auth",
      );

      expect(tab.isWorktree).toBe(true);
      expect(tab.mainRepositoryPath).toBe("/home/user/project");
      expect(tab.worktreeName).toBe("feature-auth");
    });

    test("creates worktree tab with only isWorktree flag", () => {
      const tab = createWorkspaceTab(
        "/path/to/worktree",
        "worktree",
        "/path/to/worktree",
        true,
        true,
      );

      expect(tab.isWorktree).toBe(true);
      expect(tab.mainRepositoryPath).toBeNull();
      expect(tab.worktreeName).toBeNull();
    });

    test("creates worktree tab with mainRepositoryPath but no worktreeName", () => {
      const tab = createWorkspaceTab(
        "/path/to/worktree",
        "worktree",
        "/path/to/worktree",
        true,
        true,
        "/path/to/main",
        null,
      );

      expect(tab.isWorktree).toBe(true);
      expect(tab.mainRepositoryPath).toBe("/path/to/main");
      expect(tab.worktreeName).toBeNull();
    });
  });

  describe("WorkspaceTab worktree type structure", () => {
    test("worktree tab has all required fields", () => {
      const tab: WorkspaceTab = {
        id: crypto.randomUUID(),
        path: "/home/user/.local/qraftbox/worktrees/project/feature",
        name: "feature",
        repositoryRoot: "/home/user/.local/qraftbox/worktrees/project/feature",
        isGitRepo: true,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        isWorktree: true,
        mainRepositoryPath: "/home/user/project",
        worktreeName: "feature",
      };

      expect(tab.isWorktree).toBe(true);
      expect(tab.mainRepositoryPath).toBe("/home/user/project");
      expect(tab.worktreeName).toBe("feature");
    });

    test("main repository tab has all required fields", () => {
      const tab: WorkspaceTab = {
        id: crypto.randomUUID(),
        path: "/home/user/project",
        name: "project",
        repositoryRoot: "/home/user/project",
        isGitRepo: true,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        isWorktree: false,
        mainRepositoryPath: null,
        worktreeName: null,
      };

      expect(tab.isWorktree).toBe(false);
      expect(tab.mainRepositoryPath).toBeNull();
      expect(tab.worktreeName).toBeNull();
    });
  });

  describe("updateTabAccessTime preserves worktree fields", () => {
    test("preserves worktree fields when updating access time", () => {
      const originalTab = createWorkspaceTab(
        "/path/to/worktree",
        "worktree",
        "/path/to/worktree",
        true,
        true,
        "/path/to/main",
        "worktree-name",
      );

      const updatedTab = updateTabAccessTime(originalTab);

      expect(updatedTab.isWorktree).toBe(true);
      expect(updatedTab.mainRepositoryPath).toBe("/path/to/main");
      expect(updatedTab.worktreeName).toBe("worktree-name");
      expect(updatedTab.lastAccessedAt).toBeGreaterThanOrEqual(
        originalTab.lastAccessedAt,
      );
    });
  });
});

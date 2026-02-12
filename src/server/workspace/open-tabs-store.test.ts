import { describe, test, expect } from "bun:test";
import {
  createInMemoryOpenTabsStore,
  type OpenTabEntry,
} from "./open-tabs-store.js";

describe("OpenTabsStore", () => {
  test("save and getAll should persist tab order and state", async () => {
    const store = createInMemoryOpenTabsStore();

    const tabs: OpenTabEntry[] = [
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: true,
      },
      {
        path: "/home/user/project2",
        name: "project2",
        tabOrder: 1,
        isActive: false,
        isGitRepo: false,
      },
      {
        path: "/home/user/project3",
        name: "project3",
        tabOrder: 2,
        isActive: false,
        isGitRepo: true,
      },
    ];

    await store.save(tabs);

    const retrieved = await store.getAll();

    expect(retrieved).toHaveLength(3);
    expect(retrieved[0]?.path).toBe("/home/user/project1");
    expect(retrieved[0]?.isActive).toBe(true);
    expect(retrieved[1]?.path).toBe("/home/user/project2");
    expect(retrieved[1]?.isActive).toBe(false);
    expect(retrieved[2]?.path).toBe("/home/user/project3");
  });

  test("save should replace existing tabs", async () => {
    const store = createInMemoryOpenTabsStore();

    const initialTabs: OpenTabEntry[] = [
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: true,
      },
    ];

    await store.save(initialTabs);

    const newTabs: OpenTabEntry[] = [
      {
        path: "/home/user/project2",
        name: "project2",
        tabOrder: 0,
        isActive: true,
        isGitRepo: false,
      },
      {
        path: "/home/user/project3",
        name: "project3",
        tabOrder: 1,
        isActive: false,
        isGitRepo: true,
      },
    ];

    await store.save(newTabs);

    const retrieved = await store.getAll();

    expect(retrieved).toHaveLength(2);
    expect(retrieved[0]?.path).toBe("/home/user/project2");
    expect(retrieved[1]?.path).toBe("/home/user/project3");
  });

  test("clear should remove all tabs", async () => {
    const store = createInMemoryOpenTabsStore();

    const tabs: OpenTabEntry[] = [
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: true,
      },
      {
        path: "/home/user/project2",
        name: "project2",
        tabOrder: 1,
        isActive: false,
        isGitRepo: false,
      },
    ];

    await store.save(tabs);
    await store.clear();

    const retrieved = await store.getAll();

    expect(retrieved).toHaveLength(0);
  });

  test("getAll should return empty array when no tabs exist", async () => {
    const store = createInMemoryOpenTabsStore();

    const retrieved = await store.getAll();

    expect(retrieved).toHaveLength(0);
  });

  test("getAll should return tabs in tab_order ascending", async () => {
    const store = createInMemoryOpenTabsStore();

    const tabs: OpenTabEntry[] = [
      {
        path: "/home/user/project3",
        name: "project3",
        tabOrder: 2,
        isActive: false,
        isGitRepo: true,
      },
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: true,
      },
      {
        path: "/home/user/project2",
        name: "project2",
        tabOrder: 1,
        isActive: false,
        isGitRepo: false,
      },
    ];

    await store.save(tabs);

    const retrieved = await store.getAll();

    expect(retrieved).toHaveLength(3);
    expect(retrieved[0]?.tabOrder).toBe(0);
    expect(retrieved[1]?.tabOrder).toBe(1);
    expect(retrieved[2]?.tabOrder).toBe(2);
  });

  test("isInitialized should return false before any save", async () => {
    const store = createInMemoryOpenTabsStore();

    expect(await store.isInitialized()).toBe(false);
  });

  test("isInitialized should return true after save", async () => {
    const store = createInMemoryOpenTabsStore();

    await store.save([]);

    expect(await store.isInitialized()).toBe(true);
  });

  test("isInitialized should return true after saving empty tabs (all closed)", async () => {
    const store = createInMemoryOpenTabsStore();

    const tabs: OpenTabEntry[] = [
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: true,
      },
    ];

    await store.save(tabs);
    await store.save([]);

    expect(await store.isInitialized()).toBe(true);
    expect(await store.getAll()).toHaveLength(0);
  });

  test("save should correctly convert boolean to integer flags", async () => {
    const store = createInMemoryOpenTabsStore();

    const tabs: OpenTabEntry[] = [
      {
        path: "/home/user/project1",
        name: "project1",
        tabOrder: 0,
        isActive: true,
        isGitRepo: false,
      },
      {
        path: "/home/user/project2",
        name: "project2",
        tabOrder: 1,
        isActive: false,
        isGitRepo: true,
      },
    ];

    await store.save(tabs);

    const retrieved = await store.getAll();

    expect(retrieved[0]?.isActive).toBe(true);
    expect(retrieved[0]?.isGitRepo).toBe(false);
    expect(retrieved[1]?.isActive).toBe(false);
    expect(retrieved[1]?.isGitRepo).toBe(true);
  });
});

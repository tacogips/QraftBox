import { describe, expect, test } from "bun:test";
import { createScreenNavigationItems } from "./navigation";

describe("createScreenNavigationItems", () => {
  test("keeps the project screen reachable from the default files route", () => {
    const items = createScreenNavigationItems({
      projectSlug: null,
      screen: "files",
    });

    expect(items.find((item) => item.screen === "project")).toEqual({
      screen: "project",
      label: "Project",
      href: "#/project",
      isActive: false,
      implementationStatus: "implemented",
    });
    expect(items.find((item) => item.screen === "files")).toEqual({
      screen: "files",
      label: "Files",
      href: "#/files",
      isActive: true,
      implementationStatus: "implemented",
    });
  });

  test("preserves the active project slug across implemented and planned screens", () => {
    const items = createScreenNavigationItems({
      projectSlug: "demo-repo",
      screen: "project",
    });

    expect(items.find((item) => item.screen === "files")?.href).toBe(
      "#/demo-repo/files",
    );
    expect(items.find((item) => item.screen === "commits")).toEqual({
      screen: "commits",
      label: "Commits",
      href: "#/demo-repo/commits",
      isActive: false,
      implementationStatus: "implemented",
    });
  });

  test("keeps implemented screen labels aligned across migrated screens", () => {
    const items = createScreenNavigationItems({
      projectSlug: "demo-repo",
      screen: "files",
    });

    expect(items.find((item) => item.screen === "files")).toEqual({
      screen: "files",
      label: "Files",
      href: "#/demo-repo/files",
      isActive: true,
      implementationStatus: "implemented",
    });
    expect(items.find((item) => item.screen === "ai-session")).toEqual({
      screen: "ai-session",
      label: "AI Sessions",
      href: "#/demo-repo/ai-session",
      isActive: false,
      implementationStatus: "implemented",
    });
  });
});

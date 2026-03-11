import { describe, expect, test } from "vitest";
import {
  APP_SCREENS,
  DEFAULT_APP_SCREEN,
  LEGACY_SCREEN_ALIASES,
  buildScreenHash,
  isAppScreen,
  normalizeAppScreen,
  parseAppHash,
  screenFromHash,
} from "./navigation";

describe("navigation contracts", () => {
  test("exposes the canonical app screens", () => {
    expect(APP_SCREENS).toEqual([
      "files",
      "ai-session",
      "commits",
      "terminal",
      "project",
      "system-info",
      "notifications",
      "model-profiles",
      "action-defaults",
    ]);
  });

  test("recognizes valid app screens", () => {
    expect(isAppScreen("files")).toBe(true);
    expect(isAppScreen("model-profiles")).toBe(true);
    expect(isAppScreen("unknown")).toBe(false);
  });

  test("normalizes legacy screen aliases", () => {
    expect(normalizeAppScreen("sessions")).toBe(LEGACY_SCREEN_ALIASES.sessions);
    expect(normalizeAppScreen("model-config")).toBe(
      LEGACY_SCREEN_ALIASES["model-config"],
    );
  });

  test("parses project-scoped hashes", () => {
    expect(parseAppHash("#/repo-slug/commits")).toEqual({
      projectSlug: "repo-slug",
      screen: "commits",
      contextId: null,
      selectedPath: null,
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
    });
  });

  test("parses global hashes", () => {
    expect(parseAppHash("#/terminal")).toEqual({
      projectSlug: null,
      screen: "terminal",
      contextId: null,
      selectedPath: null,
      selectedViewMode: null,
      fileTreeMode: null,
      selectedLineNumber: null,
    });
  });

  test("treats unknown single-part routes as project slugs", () => {
    expect(parseAppHash("#/repo-slug")).toEqual({
      projectSlug: "repo-slug",
      screen: DEFAULT_APP_SCREEN,
      contextId: null,
      selectedPath: null,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
    });
  });

  test("falls back to the default screen for unknown screen parts", () => {
    expect(parseAppHash("#/repo-slug/unknown-screen")).toEqual({
      projectSlug: "repo-slug",
      screen: DEFAULT_APP_SCREEN,
      contextId: null,
      selectedPath: null,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
    });
  });

  test("builds screen hashes", () => {
    expect(buildScreenHash(null, "files")).toBe(
      "#/files?view=side-by-side&tree=diff",
    );
    expect(buildScreenHash("repo-slug", "ai-session")).toBe(
      "#/repo-slug/ai-session",
    );
  });

  test("parses file-selection query state from the hash", () => {
    expect(
      parseAppHash(
        "#/repo-slug/files?path=src%2Fmain.ts&view=inline&tree=all&line=42",
      ),
    ).toEqual({
      projectSlug: "repo-slug",
      screen: "files",
      contextId: null,
      selectedPath: "src/main.ts",
      selectedViewMode: "inline",
      fileTreeMode: "all",
      selectedLineNumber: 42,
    });
  });

  test("ignores invalid file-selection query values", () => {
    expect(
      parseAppHash("#/repo-slug/files?path=&view=unknown&tree=nope&line=0"),
    ).toEqual({
      projectSlug: "repo-slug",
      screen: "files",
      contextId: null,
      selectedPath: null,
      selectedViewMode: "side-by-side",
      fileTreeMode: "diff",
      selectedLineNumber: null,
    });
  });

  test("builds screen hashes with file-selection query state", () => {
    expect(
      buildScreenHash("repo-slug", "files", {
        selectedPath: "src/main.ts",
        selectedViewMode: "current-state",
        fileTreeMode: "all",
        selectedLineNumber: 17,
      }),
    ).toBe(
      "#/repo-slug/files?path=src%2Fmain.ts&view=current-state&tree=all&line=17",
    );
  });

  test("derives the active screen from a hash", () => {
    expect(screenFromHash("#/repo-slug/model-config")).toBe("model-profiles");
  });
});

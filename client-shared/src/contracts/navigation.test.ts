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
    });
  });

  test("parses global hashes", () => {
    expect(parseAppHash("#/terminal")).toEqual({
      projectSlug: null,
      screen: "terminal",
    });
  });

  test("treats unknown single-part routes as project slugs", () => {
    expect(parseAppHash("#/repo-slug")).toEqual({
      projectSlug: "repo-slug",
      screen: DEFAULT_APP_SCREEN,
    });
  });

  test("falls back to the default screen for unknown screen parts", () => {
    expect(parseAppHash("#/repo-slug/unknown-screen")).toEqual({
      projectSlug: "repo-slug",
      screen: DEFAULT_APP_SCREEN,
    });
  });

  test("builds screen hashes", () => {
    expect(buildScreenHash(null, "files")).toBe("#/files");
    expect(buildScreenHash("repo-slug", "ai-session")).toBe(
      "#/repo-slug/ai-session",
    );
  });

  test("derives the active screen from a hash", () => {
    expect(screenFromHash("#/repo-slug/model-config")).toBe("model-profiles");
  });
});

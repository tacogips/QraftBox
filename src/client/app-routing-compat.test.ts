import { describe, expect, test } from "bun:test";
import {
  buildScreenHash,
  parseHash,
  screenFromHash,
  VALID_SCREENS,
} from "../../client-legacy/src/lib/app-routing";

describe("app-routing compatibility adapter", () => {
  test("preserves the legacy slug property for existing Svelte callers", () => {
    expect(parseHash("#/repo-slug/commits")).toEqual({
      projectSlug: "repo-slug",
      slug: "repo-slug",
      screen: "commits",
    });
  });

  test("keeps screen helpers aligned with shared navigation contracts", () => {
    expect(screenFromHash("#/repo-slug/model-config")).toBe("model-profiles");
    expect(buildScreenHash("repo-slug", "ai-session")).toBe(
      "#/repo-slug/ai-session",
    );
    expect(VALID_SCREENS.has("files")).toBe(true);
  });
});

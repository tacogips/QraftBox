import { describe, expect, test } from "bun:test";
import {
  rememberDiffSelection,
  resolveRememberedDiffSelection,
} from "./selection-memory";

describe("diff selection memory", () => {
  test("keeps the live selection when refetching the same context", () => {
    expect(
      resolveRememberedDiffSelection({
        activeContextId: "ctx-alpha",
        loadedContextId: "ctx-alpha",
        currentSelectedPath: "src/current.ts",
        rememberedSelections: {
          "ctx-alpha": "src/remembered.ts",
        },
      }),
    ).toBe("src/current.ts");
  });

  test("uses the remembered selection when switching contexts", () => {
    expect(
      resolveRememberedDiffSelection({
        activeContextId: "ctx-beta",
        loadedContextId: "ctx-alpha",
        currentSelectedPath: "src/shared.ts",
        rememberedSelections: {
          "ctx-beta": "README.md",
        },
      }),
    ).toBe("README.md");
  });

  test("falls back to null when a context has no remembered selection", () => {
    expect(
      resolveRememberedDiffSelection({
        activeContextId: "ctx-beta",
        loadedContextId: "ctx-alpha",
        currentSelectedPath: "src/shared.ts",
        rememberedSelections: {},
      }),
    ).toBeNull();
  });

  test("stores the latest selection per context", () => {
    expect(rememberDiffSelection({}, "ctx-alpha", "src/main.ts")).toEqual({
      "ctx-alpha": "src/main.ts",
    });
  });
});

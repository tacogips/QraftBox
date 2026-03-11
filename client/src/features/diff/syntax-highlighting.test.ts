import { describe, expect, test } from "bun:test";
import {
  detectHighlightLanguage,
  highlightFullFileContent,
} from "./syntax-highlighting";

describe("detectHighlightLanguage", () => {
  test("matches the broad language map from the legacy client", () => {
    expect(
      detectHighlightLanguage({
        filePath: "client-shared/src/api/ai-sessions.test.ts",
      }),
    ).toBe("typescript");
    expect(detectHighlightLanguage({ filePath: "bin/qraftbox.js" })).toBe(
      "javascript",
    );
    expect(detectHighlightLanguage({ filePath: "vite.config.cjs" })).toBe(
      "javascript",
    );
    expect(
      detectHighlightLanguage({
        filePath:
          "client-legacy/components/sessions/SessionTranscriptInline.svelte",
      }),
    ).toBe("svelte");
    expect(detectHighlightLanguage({ filePath: ".prettierrc.json" })).toBe(
      "json",
    );
    expect(detectHighlightLanguage({ filePath: "Taskfile.yml" })).toBe("yaml");
    expect(detectHighlightLanguage({ filePath: "docker/Dockerfile" })).toBe(
      "dockerfile",
    );
    expect(detectHighlightLanguage({ filePath: "Makefile" })).toBe("makefile");
    expect(detectHighlightLanguage({ filePath: "flake.nix" })).toBe("nix");
    expect(detectHighlightLanguage({ filePath: "query.graphql" })).toBe(
      "graphql",
    );
    expect(detectHighlightLanguage({ filePath: "infra/main.tf" })).toBe("hcl");
    expect(detectHighlightLanguage({ filePath: "README.md" })).toBe("markdown");
    expect(detectHighlightLanguage({ filePath: "script.ps1" })).toBe(
      "powershell",
    );
  });

  test("prefers explicit language metadata from the server", () => {
    expect(
      detectHighlightLanguage({
        language: "typescript",
        filePath: "unknown.custom",
      }),
    ).toBe("typescript");
  });
});

describe("highlightFullFileContent", () => {
  test("falls back to plain text for unsupported files", async () => {
    await expect(
      highlightFullFileContent(
        { language: "plaintext", filePath: "notes.txt" },
        "hello",
      ),
    ).resolves.toEqual([[{ text: "hello", className: "text-text-primary" }]]);
  });

  test("returns line-based token arrays for supported languages", async () => {
    const highlightedLines = await highlightFullFileContent(
      {
        filePath: "bin/qraftbox.js",
      },
      'const port = 5173;\nconsole.log("ok");',
    );

    expect(highlightedLines).toHaveLength(2);
    expect(highlightedLines[0]?.length).toBeGreaterThan(1);
    expect(
      highlightedLines[0]?.some(
        (token) => token.text === "const" && token.color !== undefined,
      ),
    ).toBe(true);
    expect(
      highlightedLines[1]?.some(
        (token) => token.text.includes('"ok"') && token.color !== undefined,
      ),
    ).toBe(true);
  });
});

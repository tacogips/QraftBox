import { describe, expect, test } from "bun:test";
import type { FileContent } from "../../../../client-shared/src/contracts/files";
import {
  isMarkdownPreviewFile,
  resolveFullFileMarkdownPreviewMode,
} from "./markdown-preview-state";

function createFileContent(overrides: Partial<FileContent> = {}): FileContent {
  return {
    path: "README.md",
    content: "# Title",
    language: "markdown",
    ...overrides,
  };
}

describe("markdown preview state", () => {
  test("detects markdown preview files by language", () => {
    expect(isMarkdownPreviewFile(createFileContent())).toBe(true);
    expect(
      isMarkdownPreviewFile(
        createFileContent({
          path: "notes.txt",
          language: "mdx",
        }),
      ),
    ).toBe(true);
  });

  test("detects markdown preview files by extension", () => {
    expect(
      isMarkdownPreviewFile(
        createFileContent({
          path: "docs/guide.MDX",
          language: "text",
        }),
      ),
    ).toBe(true);
  });

  test("ignores non-markdown and binary files", () => {
    expect(
      isMarkdownPreviewFile(
        createFileContent({
          path: "src/index.ts",
          language: "typescript",
        }),
      ),
    ).toBe(false);
    expect(
      isMarkdownPreviewFile(
        createFileContent({
          isBinary: true,
        }),
      ),
    ).toBe(false);
  });

  test("defaults markdown files to source preview mode", () => {
    expect(
      resolveFullFileMarkdownPreviewMode({
        fileContent: createFileContent(),
      }),
    ).toBe("source");
    expect(
      resolveFullFileMarkdownPreviewMode({
        fileContent: createFileContent({
          path: "src/index.ts",
          language: "typescript",
        }),
      }),
    ).toBe("source");
  });
});

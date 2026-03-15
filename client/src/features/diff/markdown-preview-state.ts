import type { FileContent } from "../../../../client-shared/src/contracts/files";

export type FullFileMarkdownPreviewMode = "rendered" | "source";

function hasMarkdownExtension(filePath: string): boolean {
  return (
    filePath.endsWith(".md") ||
    filePath.endsWith(".markdown") ||
    filePath.endsWith(".mdown") ||
    filePath.endsWith(".mkd") ||
    filePath.endsWith(".mdx")
  );
}

export function isMarkdownPreviewFile(fileContent: FileContent | null): boolean {
  if (fileContent === null || fileContent.isBinary === true) {
    return false;
  }

  const normalizedLanguage = fileContent.language.trim().toLowerCase();
  if (normalizedLanguage === "markdown" || normalizedLanguage === "mdx") {
    return true;
  }

  return hasMarkdownExtension(fileContent.path.trim().toLowerCase());
}

export function resolveFullFileMarkdownPreviewMode(params: {
  readonly fileContent: FileContent | null;
}): FullFileMarkdownPreviewMode {
  if (!isMarkdownPreviewFile(params.fileContent)) {
    return "source";
  }

  return "source";
}

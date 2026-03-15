import { describe, expect, test } from "bun:test";
import { renderMarkdownHtml } from "./markdown";

describe("renderMarkdownHtml", () => {
  test("renders mermaid code fences as dedicated placeholders", () => {
    const renderedHtml = renderMarkdownHtml(
      "```mermaid\ngraph TD;\n  A-->B;\n```",
    );

    expect(renderedHtml).toContain("qraftbox-mermaid-source");
    expect(renderedHtml).toContain("graph TD;");
    expect(renderedHtml).not.toContain("<script");
  });

  test("renders standard markdown headings", () => {
    expect(renderMarkdownHtml("# Title")).toContain("<h1>Title</h1>");
  });

  test("resolves relative markdown image paths against the markdown file", () => {
    const renderedHtml = renderMarkdownHtml("![Architecture](./images/app.png)", {
      markdownFilePath: "docs/README.md",
      cacheScopeKey: "ctx-1:docs/README.md",
      resolveFileUrl: (repoRelativePath) => `/raw/${repoRelativePath}`,
    });

    expect(renderedHtml).toContain('src="/raw/docs/images/app.png"');
  });

  test("resolves relative raw HTML image paths against the markdown file", () => {
    const renderedHtml = renderMarkdownHtml(
      '<img src="usage/resource/qraftbox_log.png" alt="QraftBox">',
      {
        markdownFilePath: "README.md",
        cacheScopeKey: "ctx-1:README.md",
        resolveFileUrl: (repoRelativePath) => `/raw/${repoRelativePath}`,
      },
    );

    expect(renderedHtml).toContain('src="/raw/usage/resource/qraftbox_log.png"');
  });
});

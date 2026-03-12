import DOMPurify from "dompurify";
import { marked } from "marked";

const MAX_MARKDOWN_CACHE_ENTRIES = 400;
const markdownRenderCache = new Map<string, string>();

function renderMarkdown(text: string): string {
  const parsedMarkdown = marked.parse(text, {
    async: false,
    breaks: true,
    gfm: true,
  });
  const html = typeof parsedMarkdown === "string" ? parsedMarkdown : "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

export function renderAiSessionMarkdown(text: string): string {
  if (text.length === 0) {
    return "";
  }

  const cachedHtml = markdownRenderCache.get(text);
  if (cachedHtml !== undefined) {
    return cachedHtml;
  }

  const renderedHtml = renderMarkdown(text);
  markdownRenderCache.set(text, renderedHtml);
  if (markdownRenderCache.size > MAX_MARKDOWN_CACHE_ENTRIES) {
    const oldestCacheKey = markdownRenderCache.keys().next().value;
    if (typeof oldestCacheKey === "string") {
      markdownRenderCache.delete(oldestCacheKey);
    }
  }

  return renderedHtml;
}

import DOMPurify from "dompurify";
import { marked, Renderer } from "marked";

const MAX_MARKDOWN_CACHE_ENTRIES = 400;
const markdownRenderCache = new Map<string, string>();
let mermaidModulePromise: Promise<{
  readonly default: {
    initialize(config: object): void;
    render(
      id: string,
      definition: string,
    ): Promise<{
      readonly svg: string;
    }>;
  };
} | null> | null = null;
let mermaidRenderId = 0;

interface MarkdownRenderOptions {
  readonly markdownFilePath?: string | undefined;
  readonly resolveFileUrl?:
    | ((repoRelativePath: string) => string | null)
    | undefined;
  readonly cacheScopeKey?: string | undefined;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isMermaidFence(language: string | undefined): boolean {
  return language?.trim().toLowerCase() === "mermaid";
}

function shouldKeepMarkdownUrlAsIs(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/iu.test(url);
}

function splitMarkdownUrl(url: string): {
  readonly path: string;
  readonly suffix: string;
} {
  const suffixStartIndex = url.search(/[?#]/u);
  if (suffixStartIndex < 0) {
    return {
      path: url,
      suffix: "",
    };
  }

  return {
    path: url.slice(0, suffixStartIndex),
    suffix: url.slice(suffixStartIndex),
  };
}

function normalizeRepoRelativePath(pathValue: string): string | null {
  const normalizedSegments: string[] = [];
  for (const rawSegment of pathValue.split("/")) {
    const pathSegment = rawSegment.trim();
    if (pathSegment.length === 0 || pathSegment === ".") {
      continue;
    }
    if (pathSegment === "..") {
      const parentSegment = normalizedSegments.pop();
      if (parentSegment === undefined) {
        return null;
      }
      continue;
    }
    normalizedSegments.push(pathSegment);
  }

  return normalizedSegments.join("/");
}

function dirnameOfRepoPath(filePath: string): string {
  const pathSegments = filePath.split("/");
  pathSegments.pop();
  return pathSegments.join("/");
}

function resolveMarkdownAssetRepoPath(
  markdownFilePath: string,
  assetUrl: string,
): string | null {
  const { path: assetPathOnly, suffix } = splitMarkdownUrl(assetUrl.trim());
  if (assetPathOnly.length === 0 || shouldKeepMarkdownUrlAsIs(assetUrl.trim())) {
    return assetUrl.trim();
  }

  const repoRelativePath = assetPathOnly.startsWith("/")
    ? assetPathOnly.slice(1)
    : [dirnameOfRepoPath(markdownFilePath), assetPathOnly]
        .filter((pathSegment) => pathSegment.length > 0)
        .join("/");
  const normalizedRepoRelativePath = normalizeRepoRelativePath(repoRelativePath);
  if (normalizedRepoRelativePath === null) {
    return null;
  }

  return `${normalizedRepoRelativePath}${suffix}`;
}

function resolveMarkdownImageUrl(
  imageUrl: string,
  options: MarkdownRenderOptions,
): string {
  if (
    options.markdownFilePath === undefined ||
    options.resolveFileUrl === undefined
  ) {
    return imageUrl;
  }

  const resolvedRepoRelativePath = resolveMarkdownAssetRepoPath(
    options.markdownFilePath,
    imageUrl,
  );
  if (resolvedRepoRelativePath === null) {
    return imageUrl.trim();
  }

  const { path: assetPathOnly, suffix } = splitMarkdownUrl(resolvedRepoRelativePath);
  const resolvedFileUrl = options.resolveFileUrl(assetPathOnly);
  if (resolvedFileUrl === null) {
    return imageUrl.trim();
  }

  return `${resolvedFileUrl}${suffix}`;
}

function rewriteMarkdownImageSourcesInHtml(
  html: string,
  options: MarkdownRenderOptions,
): string {
  return html.replace(
    /<img\b[^>]*>/gi,
    (imageTagMarkup) => {
      if (imageTagMarkup.includes('data-qraftbox-md-image="true"')) {
        return imageTagMarkup.replace(
          /\sdata-qraftbox-md-image="true"/i,
          "",
        );
      }

      const sourceAttributeMatch = imageTagMarkup.match(
        /\bsrc=(?:"([^"]*)"|'([^']*)')/i,
      );
      if (sourceAttributeMatch === null) {
        return imageTagMarkup;
      }

      const originalImageUrl =
        sourceAttributeMatch[1] ?? sourceAttributeMatch[2] ?? "";
      const quoteCharacter =
        sourceAttributeMatch[1] !== undefined ? '"' : "'";
      const resolvedImageUrl = resolveMarkdownImageUrl(
        originalImageUrl,
        options,
      );
      return imageTagMarkup.replace(
        /\bsrc=(?:"([^"]*)"|'([^']*)')/i,
        `src=${quoteCharacter}${escapeHtml(resolvedImageUrl)}${quoteCharacter}`,
      );
    },
  );
}

function createMarkdownRenderer(options: MarkdownRenderOptions): Renderer {
  const renderer = new Renderer();
  renderer.code = ({ text, lang, escaped }) => {
    if (!isMermaidFence(lang)) {
      return Renderer.prototype.code.call(renderer, {
        type: "code",
        raw: text,
        text,
        lang,
        escaped,
      });
    }

    return `<pre class="qraftbox-mermaid-source">${escapeHtml(text)}</pre>`;
  };
  renderer.image = ({ href, title, text }) => {
    const resolvedHref =
      typeof href === "string"
        ? resolveMarkdownImageUrl(href, options)
        : "";
    const imageAttributes = [
      'data-qraftbox-md-image="true"',
      `src="${escapeHtml(resolvedHref)}"`,
      `alt="${escapeHtml(text)}"`,
    ];
    if (typeof title === "string" && title.length > 0) {
      imageAttributes.push(`title="${escapeHtml(title)}"`);
    }
    return `<img ${imageAttributes.join(" ")}>`;
  };
  return renderer;
}

function renderMarkdown(
  text: string,
  options: MarkdownRenderOptions = {},
): string {
  const parsedMarkdown = marked.parse(text, {
    async: false,
    breaks: true,
    gfm: true,
    renderer: createMarkdownRenderer(options),
  });
  const html = typeof parsedMarkdown === "string" ? parsedMarkdown : "";
  const sanitize = (
    DOMPurify as {
      readonly sanitize?: ((dirty: string, config?: object) => string) | undefined;
    }
  ).sanitize;
  if (typeof sanitize !== "function") {
    return rewriteMarkdownImageSourcesInHtml(html, options);
  }

  return rewriteMarkdownImageSourcesInHtml(
    sanitize(html, {
      USE_PROFILES: { html: true },
    }),
    options,
  );
}

function buildMarkdownCacheKey(
  text: string,
  options: MarkdownRenderOptions,
): string {
  return JSON.stringify({
    text,
    markdownFilePath: options.markdownFilePath ?? "",
    cacheScopeKey: options.cacheScopeKey ?? "",
  });
}

export function renderMarkdownHtml(
  text: string,
  options: MarkdownRenderOptions = {},
): string {
  if (text.length === 0) {
    return "";
  }

  const markdownCacheKey = buildMarkdownCacheKey(text, options);
  const cachedHtml = markdownRenderCache.get(markdownCacheKey);
  if (cachedHtml !== undefined) {
    return cachedHtml;
  }

  const renderedHtml = renderMarkdown(text, options);
  markdownRenderCache.set(markdownCacheKey, renderedHtml);
  if (markdownRenderCache.size > MAX_MARKDOWN_CACHE_ENTRIES) {
    const oldestCacheKey = markdownRenderCache.keys().next().value;
    if (typeof oldestCacheKey === "string") {
      markdownRenderCache.delete(oldestCacheKey);
    }
  }

  return renderedHtml;
}

async function getMermaidModule(): Promise<{
  readonly default: {
    initialize(config: object): void;
    render(
      id: string,
      definition: string,
    ): Promise<{
      readonly svg: string;
    }>;
  };
} | null> {
  if (mermaidModulePromise !== null) {
    return mermaidModulePromise;
  }

  mermaidModulePromise = import("mermaid")
    .then((mermaidModule) => {
      mermaidModule.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
      });
      return mermaidModule;
    })
    .catch(() => null);
  return mermaidModulePromise;
}

export function enhanceMarkdownElements(containerElement: HTMLElement): void {
  const mermaidSourceElements = containerElement.querySelectorAll<HTMLElement>(
    ".qraftbox-mermaid-source",
  );
  for (const mermaidSourceElement of mermaidSourceElements) {
    if (mermaidSourceElement.dataset.renderState !== undefined) {
      continue;
    }

    mermaidSourceElement.dataset.renderState = "pending";
    const mermaidDefinition = mermaidSourceElement.textContent?.trim() ?? "";
    if (mermaidDefinition.length === 0) {
      mermaidSourceElement.dataset.renderState = "empty";
      continue;
    }

    void getMermaidModule().then(async (mermaidModule) => {
      if (mermaidModule === null || !mermaidSourceElement.isConnected) {
        mermaidSourceElement.dataset.renderState = "unavailable";
        return;
      }

      try {
        mermaidRenderId += 1;
        const { svg } = await mermaidModule.default.render(
          `qraftbox-mermaid-${mermaidRenderId}`,
          mermaidDefinition,
        );
        if (!mermaidSourceElement.isConnected) {
          return;
        }

        const mermaidDiagramElement = document.createElement("div");
        mermaidDiagramElement.className = "qraftbox-mermaid-diagram";
        mermaidDiagramElement.innerHTML = svg;
        mermaidSourceElement.replaceWith(mermaidDiagramElement);
      } catch {
        mermaidSourceElement.dataset.renderState = "error";
        mermaidSourceElement.classList.add("qraftbox-mermaid-error");
      }
    });
  }
}

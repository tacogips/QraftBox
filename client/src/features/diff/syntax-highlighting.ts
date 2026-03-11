import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
  type ThemedToken,
} from "shiki";

export interface HighlightToken {
  readonly text: string;
  readonly color?: string | undefined;
  readonly className?: string | undefined;
}

export interface SyntaxHighlightContext {
  readonly language?: string | undefined;
  readonly filePath?: string | undefined;
}

const DEFAULT_TOKEN_CLASS = "text-text-primary";
const SHIKI_THEME = "github-dark";

let highlighterInstance: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<string>();

const EXTENSION_LANGUAGE_MAP = new Map<string, string>([
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["svelte", "svelte"],
  ["vue", "vue"],
  ["py", "python"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["go", "go"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["c", "c"],
  ["h", "c"],
  ["cpp", "cpp"],
  ["cc", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["hxx", "cpp"],
  ["cs", "csharp"],
  ["css", "css"],
  ["scss", "scss"],
  ["less", "less"],
  ["html", "html"],
  ["htm", "html"],
  ["xml", "xml"],
  ["svg", "xml"],
  ["json", "json"],
  ["jsonc", "jsonc"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["mdx", "mdx"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["fish", "fish"],
  ["sql", "sql"],
  ["toml", "toml"],
  ["nix", "nix"],
  ["lua", "lua"],
  ["swift", "swift"],
  ["php", "php"],
  ["r", "r"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["tf", "hcl"],
  ["hcl", "hcl"],
  ["proto", "protobuf"],
  ["zig", "zig"],
  ["elm", "elm"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["erl", "erlang"],
  ["hs", "haskell"],
  ["clj", "clojure"],
  ["dart", "dart"],
  ["scala", "scala"],
  ["groovy", "groovy"],
  ["pl", "perl"],
  ["vim", "viml"],
  ["ini", "ini"],
  ["conf", "ini"],
  ["cfg", "ini"],
  ["diff", "diff"],
  ["patch", "diff"],
  ["ps1", "powershell"],
  ["bat", "batch"],
  ["cmd", "batch"],
]);

const FILENAME_LANGUAGE_MAP = new Map<string, string>([
  ["dockerfile", "dockerfile"],
  ["makefile", "makefile"],
  ["cmakelists", "cmake"],
  ["gemfile", "ruby"],
  ["rakefile", "ruby"],
  ["justfile", "just"],
]);

function createPlainToken(text: string): HighlightToken {
  return { text, className: DEFAULT_TOKEN_CLASS };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance !== null) {
    return highlighterInstance;
  }

  if (initPromise !== null) {
    return initPromise;
  }

  initPromise = createHighlighter({
    themes: [SHIKI_THEME],
    langs: [],
  });

  highlighterInstance = await initPromise;
  return highlighterInstance;
}

async function ensureLanguage(
  highlighter: Highlighter,
  language: string,
): Promise<boolean> {
  if (loadedLanguages.has(language)) {
    return true;
  }

  try {
    await highlighter.loadLanguage(
      language as Parameters<Highlighter["loadLanguage"]>[0],
    );
    loadedLanguages.add(language);
    return true;
  } catch {
    return false;
  }
}

function normalizeLanguageAlias(language: string): string {
  const normalizedLanguage = language.trim().toLowerCase();
  return EXTENSION_LANGUAGE_MAP.get(normalizedLanguage) ?? normalizedLanguage;
}

export function detectHighlightLanguage(
  context: SyntaxHighlightContext,
): string {
  const explicitLanguage = context.language?.trim().toLowerCase();
  if (
    explicitLanguage !== undefined &&
    explicitLanguage.length > 0 &&
    explicitLanguage !== "text" &&
    explicitLanguage !== "plaintext"
  ) {
    return normalizeLanguageAlias(explicitLanguage);
  }

  const basename = (context.filePath?.split("/").pop() ?? "").toLowerCase();
  const basenameWithoutExt = basename.split(".")[0] ?? basename;
  const filenameLanguage = FILENAME_LANGUAGE_MAP.get(basenameWithoutExt);
  if (filenameLanguage !== undefined) {
    return filenameLanguage;
  }

  const extension = basename.includes(".")
    ? (basename.split(".").pop() ?? "")
    : "";
  return EXTENSION_LANGUAGE_MAP.get(extension) ?? "text";
}

function convertTokensToLine(
  tokens: readonly ThemedToken[],
): readonly HighlightToken[] {
  if (tokens.length === 0) {
    return [createPlainToken("")];
  }

  return tokens.map((token) => ({
    text: token.content,
    ...(token.color !== undefined
      ? { color: token.color }
      : { className: DEFAULT_TOKEN_CLASS }),
  }));
}

function splitPlainLines(
  content: string,
): readonly (readonly HighlightToken[])[] {
  return content.split("\n").map((line) => [createPlainToken(line)]);
}

export async function highlightFullFileContent(
  context: SyntaxHighlightContext,
  content: string,
): Promise<readonly (readonly HighlightToken[])[]> {
  if (content.length === 0) {
    return [[createPlainToken("")]];
  }

  const language = detectHighlightLanguage(context);
  if (language === "text") {
    return splitPlainLines(content);
  }

  try {
    const highlighter = await getHighlighter();
    const languageLoaded = await ensureLanguage(highlighter, language);
    if (!languageLoaded) {
      return splitPlainLines(content);
    }

    const result = highlighter.codeToTokens(content, {
      lang: language as BundledLanguage,
      theme: SHIKI_THEME,
    });

    return result.tokens.map((lineTokens) => convertTokensToLine(lineTokens));
  } catch {
    return splitPlainLines(content);
  }
}

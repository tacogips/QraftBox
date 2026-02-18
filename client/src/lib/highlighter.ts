import {
  createHighlighter,
  type Highlighter,
  type ThemedToken,
  type BundledLanguage,
} from "shiki";

let highlighterInstance: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance !== null) return highlighterInstance;
  if (initPromise !== null) return initPromise;

  initPromise = createHighlighter({
    themes: ["github-dark"],
    langs: [],
  });

  highlighterInstance = await initPromise;
  return highlighterInstance;
}

async function ensureLanguage(hl: Highlighter, lang: string): Promise<boolean> {
  if (loadedLanguages.has(lang)) return true;
  try {
    await hl.loadLanguage(lang as Parameters<Highlighter["loadLanguage"]>[0]);
    loadedLanguages.add(lang);
    return true;
  } catch {
    return false;
  }
}

const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  svelte: "svelte",
  vue: "vue",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "mdx",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  sql: "sql",
  toml: "toml",
  nix: "nix",
  lua: "lua",
  swift: "swift",
  php: "php",
  r: "r",
  graphql: "graphql",
  gql: "graphql",
  tf: "hcl",
  hcl: "hcl",
  proto: "protobuf",
  zig: "zig",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  dart: "dart",
  scala: "scala",
  groovy: "groovy",
  pl: "perl",
  vim: "viml",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  diff: "diff",
  patch: "diff",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",
};

const FILENAME_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmakelists: "cmake",
  gemfile: "ruby",
  rakefile: "ruby",
  justfile: "just",
};

export function detectLanguage(filename: string): string {
  const basename = (filename.split("/").pop() ?? "").toLowerCase();

  // Check exact filename matches
  const basenameWithoutExt = basename.split(".")[0] ?? basename;
  const filenameMatch = FILENAME_MAP[basenameWithoutExt];
  if (filenameMatch !== undefined) return filenameMatch;

  // Check extension
  const ext = basename.includes(".") ? (basename.split(".").pop() ?? "") : "";
  return EXTENSION_MAP[ext] ?? "text";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokensToHtml(tokens: ThemedToken[]): string {
  return tokens
    .map((t) => {
      const escaped = escapeHtml(t.content);
      if (t.color !== undefined) {
        return `<span style="color:${t.color}">${escaped}</span>`;
      }
      return escaped;
    })
    .join("");
}

/**
 * Highlight code and return an array of HTML strings, one per line.
 * Returns plain escaped text if language is unknown or highlighting fails.
 */
export async function highlightLines(
  code: string,
  filename: string,
): Promise<string[]> {
  const lang = detectLanguage(filename);
  if (lang === "text" || code.length === 0) {
    return code.split("\n").map((line) => escapeHtml(line));
  }

  try {
    const hl = await getHighlighter();
    const loaded = await ensureLanguage(hl, lang);
    if (!loaded) {
      return code.split("\n").map((line) => escapeHtml(line));
    }

    const result = hl.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: "github-dark",
    });

    return result.tokens.map((lineTokens) => tokensToHtml(lineTokens));
  } catch {
    return code.split("\n").map((line) => escapeHtml(line));
  }
}

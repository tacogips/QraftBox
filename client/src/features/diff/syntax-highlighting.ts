import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";
import { detectFileSyntaxLanguage } from "../../../../client-shared/src/syntax/language-detection";

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

function createPlainToken(text: string): HighlightToken {
  return { text, className: DEFAULT_TOKEN_CLASS };
}

async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance !== null) {
    return highlighterInstance;
  }

  if (initPromise !== null) {
    return initPromise;
  }

  initPromise = import("shiki").then(({ createHighlighter }) =>
    createHighlighter({
      themes: [SHIKI_THEME],
      langs: [],
    }),
  );

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

export function detectHighlightLanguage(
  context: SyntaxHighlightContext,
): string {
  return detectFileSyntaxLanguage(context);
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

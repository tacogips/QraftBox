export interface LanguageDetectionContext {
  readonly language?: string | undefined;
  readonly filePath?: string | undefined;
}

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
  ["markdown", "markdown"],
  ["mdown", "markdown"],
  ["mkd", "markdown"],
  ["mdx", "mdx"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["fish", "fish"],
  ["sql", "sql"],
  ["toml", "toml"],
  ["nix", "nix"],
  ["lua", "lua"],
  ["luau", "lua"],
  ["swift", "swift"],
  ["php", "php"],
  ["phtml", "php"],
  ["r", "r"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["tf", "hcl"],
  ["tfvars", "hcl"],
  ["hcl", "hcl"],
  ["proto", "protobuf"],
  ["zig", "zig"],
  ["elm", "elm"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["erl", "erlang"],
  ["hrl", "erlang"],
  ["hs", "haskell"],
  ["lhs", "haskell"],
  ["clj", "clojure"],
  ["cljs", "clojure"],
  ["cljc", "clojure"],
  ["edn", "clojure"],
  ["dart", "dart"],
  ["scala", "scala"],
  ["sc", "scala"],
  ["sbt", "scala"],
  ["groovy", "groovy"],
  ["gvy", "groovy"],
  ["gradle", "groovy"],
  ["pl", "perl"],
  ["pm", "perl"],
  ["vim", "viml"],
  ["vimrc", "viml"],
  ["ini", "ini"],
  ["conf", "ini"],
  ["cfg", "ini"],
  ["diff", "diff"],
  ["patch", "diff"],
  ["ps1", "powershell"],
  ["bat", "batch"],
  ["cmd", "batch"],
  ["env", "bash"],
]);

const FILENAME_LANGUAGE_MAP = new Map<string, string>([
  ["dockerfile", "dockerfile"],
  ["makefile", "makefile"],
  ["cmakelists", "cmake"],
  ["gemfile", "ruby"],
  ["rakefile", "ruby"],
  ["justfile", "just"],
]);

const LANGUAGE_ALIAS_MAP = new Map<string, string>([
  ["text", "text"],
  ["plaintext", "text"],
  ["plain", "text"],
  ["txt", "text"],
  ["ts", "typescript"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["py", "python"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["shell", "bash"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["clj", "clojure"],
  ["cljs", "clojure"],
  ["cljc", "clojure"],
  ["tf", "hcl"],
  ["tfvars", "hcl"],
  ["proto3", "protobuf"],
  ["docker", "dockerfile"],
  ["c++", "cpp"],
  ["c#", "csharp"],
  ["golang", "go"],
]);

export function normalizeDetectedLanguage(language: string): string {
  const normalizedLanguage = language.trim().toLowerCase();
  return (
    LANGUAGE_ALIAS_MAP.get(normalizedLanguage) ??
    EXTENSION_LANGUAGE_MAP.get(normalizedLanguage) ??
    normalizedLanguage
  );
}

export function detectFileSyntaxLanguage(
  context: LanguageDetectionContext,
): string {
  const explicitLanguage = context.language?.trim().toLowerCase();
  if (explicitLanguage !== undefined && explicitLanguage.length > 0) {
    const normalizedExplicitLanguage =
      normalizeDetectedLanguage(explicitLanguage);
    if (normalizedExplicitLanguage !== "text") {
      return normalizedExplicitLanguage;
    }
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

export function detectServerFileLanguage(filePath: string): string {
  const detectedLanguage = detectFileSyntaxLanguage({
    filePath,
  });
  return detectedLanguage === "text" ? "plaintext" : detectedLanguage;
}

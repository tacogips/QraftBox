import { describe, expect, test } from "bun:test";
import {
  detectFileSyntaxLanguage,
  detectServerFileLanguage,
  normalizeDetectedLanguage,
} from "./language-detection";

describe("language detection", () => {
  test("normalizes common language aliases", () => {
    expect(normalizeDetectedLanguage("shell")).toBe("bash");
    expect(normalizeDetectedLanguage("cjs")).toBe("javascript");
    expect(normalizeDetectedLanguage("golang")).toBe("go");
    expect(normalizeDetectedLanguage("cljc")).toBe("clojure");
    expect(normalizeDetectedLanguage("plaintext")).toBe("text");
  });

  test("detects major languages from file paths", () => {
    expect(detectFileSyntaxLanguage({ filePath: "src/main.rs" })).toBe("rust");
    expect(detectFileSyntaxLanguage({ filePath: "flake.nix" })).toBe("nix");
    expect(detectFileSyntaxLanguage({ filePath: "app/config.toml" })).toBe(
      "toml",
    );
    expect(detectFileSyntaxLanguage({ filePath: "app/config.yaml" })).toBe(
      "yaml",
    );
    expect(detectFileSyntaxLanguage({ filePath: "bin/start.cjs" })).toBe(
      "javascript",
    );
    expect(detectFileSyntaxLanguage({ filePath: "src/Main.hs" })).toBe(
      "haskell",
    );
    expect(detectFileSyntaxLanguage({ filePath: "src/core.clj" })).toBe(
      "clojure",
    );
    expect(detectFileSyntaxLanguage({ filePath: "src/main.go" })).toBe("go");
    expect(detectFileSyntaxLanguage({ filePath: "src/app.erl" })).toBe(
      "erlang",
    );
    expect(detectFileSyntaxLanguage({ filePath: "src/Main.java" })).toBe(
      "java",
    );
    expect(detectFileSyntaxLanguage({ filePath: "src/Main.scala" })).toBe(
      "scala",
    );
    expect(detectFileSyntaxLanguage({ filePath: "lua/init.lua" })).toBe(
      "lua",
    );
  });

  test("prefers explicit server language when it is meaningful", () => {
    expect(
      detectFileSyntaxLanguage({
        language: "rust",
        filePath: "unknown.txt",
      }),
    ).toBe("rust");
    expect(
      detectFileSyntaxLanguage({
        language: "plaintext",
        filePath: "src/core.clj",
      }),
    ).toBe("clojure");
  });

  test("returns plaintext only when no known mapping exists", () => {
    expect(detectServerFileLanguage("notes.unknown")).toBe("plaintext");
    expect(detectServerFileLanguage("src/main.rs")).toBe("rust");
  });
});

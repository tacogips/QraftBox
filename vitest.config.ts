import { defineConfig } from "vitest/config";
import { resolve, relative } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function findBunTestFiles(baseDir: string, dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !["node_modules", "dist", ".direnv"].includes(entry.name)) {
        results.push(...findBunTestFiles(baseDir, fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          if (content.includes('from "bun:test"')) {
            results.push(relative(baseDir, fullPath));
          }
        } catch {}
      }
    }
  } catch {}
  return results;
}

const projectRoot = resolve(__dirname);
const bunTestFiles = findBunTestFiles(projectRoot, resolve(projectRoot, "src"));

export default defineConfig({
  resolve: {
    alias: {
      "claude-code-agent/src": resolve(
        __dirname,
        "node_modules/claude-code-agent/src",
      ),
    },
  },
  test: {
    exclude: [
      "node_modules",
      "dist",
      "client",
      "e2e",
      ".direnv",
      ...bunTestFiles,
    ],
  },
});

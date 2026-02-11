import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

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
    exclude: ["node_modules", "dist", "client", "e2e"],
  },
});

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const apiProxyTarget =
  process.env["VITE_API_PROXY_TARGET"] ?? "http://127.0.0.1:7144";
const wsProxyTarget =
  process.env["VITE_WS_PROXY_TARGET"] ?? "ws://127.0.0.1:7144";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    conditions: ["browser", "import", "module", "default"],
  },
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: wsProxyTarget,
        ws: true,
      },
    },
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});

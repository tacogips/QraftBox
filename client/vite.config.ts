import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";
import { resolveViteAllowedHosts } from "../src/config/vite-allowed-hosts";

const apiProxyTarget =
  process.env["VITE_API_PROXY_TARGET"] ?? "http://localhost:7144";
const wsProxyTarget =
  process.env["VITE_WS_PROXY_TARGET"] ?? "ws://localhost:7144";
const allowedHosts = resolveViteAllowedHosts();

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  server: {
    allowedHosts,
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

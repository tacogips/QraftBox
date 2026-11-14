import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { resolveViteAllowedHosts } from "../src/config/vite-allowed-hosts";
import { ensureSocketDestroySoon } from "../src/config/vite-bun-compat";

const apiProxyTarget =
  process.env["VITE_API_PROXY_TARGET"] ?? "http://localhost:7144";
const wsProxyTarget =
  process.env["VITE_WS_PROXY_TARGET"] ?? "ws://localhost:7144";
const allowedHosts = resolveViteAllowedHosts();

function createBunSocketCompatPlugin() {
  return {
    name: "qraftbox-bun-socket-compat",
    configureServer(devServer: {
      readonly httpServer:
        | {
            on(
              eventName: "connection",
              listener: (socket: unknown) => void,
            ): void;
          }
        | null
        | undefined;
    }) {
      devServer.httpServer?.on("connection", (socket) => {
        ensureSocketDestroySoon(
          socket as Parameters<typeof ensureSocketDestroySoon>[0],
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [solidPlugin(), createBunSocketCompatPlugin()],
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

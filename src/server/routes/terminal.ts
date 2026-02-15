import { Hono } from "hono";
import type { ServerContext } from "../workspace/context-manager.js";
import type { TerminalSessionManager } from "../terminal/session-manager.js";

interface TerminalConnectResponse {
  readonly sessionId: string;
  readonly websocketPath: string;
  readonly websocketUrl: string;
}

export function createTerminalRoutes(
  serverContext: ServerContext,
  terminalSessionManager: TerminalSessionManager,
): Hono {
  const app = new Hono();

  app.post("/connect", (c) => {
    const connectResult = terminalSessionManager.createSession(
      serverContext.projectPath,
    );
    const requestUrl = new URL(c.req.url);
    const websocketProtocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
    const websocketUrl = `${websocketProtocol}//${requestUrl.host}${connectResult.websocketPath}`;

    const response: TerminalConnectResponse = {
      sessionId: connectResult.sessionId,
      websocketPath: connectResult.websocketPath,
      websocketUrl,
    };

    return c.json(response);
  });

  return app;
}

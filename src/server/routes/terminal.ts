import { Hono } from "hono";
import type { ServerContext } from "../workspace/context-manager.js";
import type { TerminalSessionManager } from "../terminal/session-manager.js";

interface TerminalConnectResponse {
  readonly sessionId: string;
  readonly websocketPath: string;
  readonly websocketUrl: string;
  readonly reused: boolean;
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
      reused: connectResult.reused,
    };

    return c.json(response);
  });

  app.get("/status", (c) => {
    const existingSession = terminalSessionManager.getSessionByCwd(
      serverContext.projectPath,
    );
    if (existingSession === null) {
      return c.json({ hasSession: false });
    }

    const requestUrl = new URL(c.req.url);
    const websocketProtocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
    const websocketUrl = `${websocketProtocol}//${requestUrl.host}${existingSession.websocketPath}`;

    return c.json({
      hasSession: true,
      sessionId: existingSession.sessionId,
      websocketPath: existingSession.websocketPath,
      websocketUrl,
    });
  });

  app.post("/disconnect", (c) => {
    const closed = terminalSessionManager.closeSessionByCwd(
      serverContext.projectPath,
    );
    return c.json({ closed });
  });

  return app;
}

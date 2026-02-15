import type { ServerWebSocket, Subprocess } from "bun";
import { createLogger } from "../logger";

export type TerminalSocketData = {
  readonly channel: "terminal";
  readonly sessionId: string;
};

export interface TerminalConnectResult {
  readonly sessionId: string;
  readonly websocketPath: string;
  readonly reused: boolean;
}

export interface TerminalSessionInfo {
  readonly sessionId: string;
  readonly websocketPath: string;
}

type ServerTerminalSocket = ServerWebSocket<TerminalSocketData>;

type TerminalClientMessage =
  | {
      readonly type: "input";
      readonly data: string;
    }
  | {
      readonly type: "ping";
    };

type TerminalServerMessage =
  | {
      readonly type: "output";
      readonly data: string;
    }
  | {
      readonly type: "exit";
      readonly code: number;
    }
  | {
      readonly type: "error";
      readonly message: string;
    }
  | {
      readonly type: "pong";
    };

interface TerminalSession {
  readonly id: string;
  readonly cwd: string;
  process: Subprocess<"pipe", "pipe", "pipe"> | undefined;
  socket: ServerTerminalSocket | undefined;
  bufferedOutput: string[];
  readonly createdAt: number;
}

export interface TerminalSessionManager {
  createSession(cwd: string): TerminalConnectResult;
  hasSession(sessionId: string): boolean;
  getSessionByCwd(cwd: string): TerminalSessionInfo | null;
  handleOpen(sessionId: string, socket: ServerTerminalSocket): void;
  handleMessage(socket: ServerTerminalSocket, message: string | Buffer): void;
  handleClose(socket: ServerTerminalSocket): void;
  closeSessionByCwd(cwd: string): boolean;
  closeSession(sessionId: string): void;
  closeAll(): void;
}

async function streamProcessOutput(
  stream: ReadableStream<Uint8Array>,
  onData: (outputChunk: string) => void,
): Promise<void> {
  const outputReader = stream.getReader();
  const textDecoder = new TextDecoder();

  try {
    while (true) {
      const { value: outputBytes, done } = await outputReader.read();
      if (done) {
        break;
      }
      if (outputBytes !== undefined && outputBytes.byteLength > 0) {
        const outputChunk = textDecoder.decode(outputBytes, { stream: true });
        if (outputChunk.length > 0) {
          onData(outputChunk);
        }
      }
    }

    const finalChunk = textDecoder.decode();
    if (finalChunk.length > 0) {
      onData(finalChunk);
    }
  } finally {
    outputReader.releaseLock();
  }
}

export function createTerminalSessionManager(): TerminalSessionManager {
  const logger = createLogger("Terminal");
  const sessions = new Map<string, TerminalSession>();
  const sessionIdByCwd = new Map<string, string>();
  const socketToSessionId = new WeakMap<ServerTerminalSocket, string>();

  function sendMessage(
    session: TerminalSession,
    payload: TerminalServerMessage,
  ): void {
    if (session.socket === undefined) {
      return;
    }
    if (session.socket.readyState !== 1) {
      return;
    }

    try {
      session.socket.send(JSON.stringify(payload));
    } catch (error) {
      logger.error("Failed to send terminal WebSocket message", error, {
        sessionId: session.id,
        messageType: payload.type,
      });
    }
  }

  function emitOutput(session: TerminalSession, outputChunk: string): void {
    if (session.socket !== undefined && session.socket.readyState === 1) {
      sendMessage(session, { type: "output", data: outputChunk });
      return;
    }

    session.bufferedOutput.push(outputChunk);
    if (session.bufferedOutput.length > 200) {
      session.bufferedOutput.shift();
    }
  }

  function spawnShellProcess(session: TerminalSession): void {
    if (session.process !== undefined) {
      return;
    }

    const shellPath = process.env["SHELL"] ?? "bash";
    const scriptPath = Bun.which("script");
    const spawnCommand =
      scriptPath !== null
        ? [scriptPath, "-q", "-f", "/dev/null", "-c", `${shellPath} -i`]
        : [shellPath, "-i"];

    const spawnedProcess = Bun.spawn(spawnCommand, {
      cwd: session.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    session.process = spawnedProcess;

    void streamProcessOutput(spawnedProcess.stdout, (outputChunk) => {
      emitOutput(session, outputChunk);
    }).catch((error) => {
      logger.error("Failed to read shell stdout", error, {
        sessionId: session.id,
      });
    });

    void streamProcessOutput(spawnedProcess.stderr, (outputChunk) => {
      emitOutput(session, outputChunk);
    }).catch((error) => {
      logger.error("Failed to read shell stderr", error, {
        sessionId: session.id,
      });
    });

    void spawnedProcess.exited
      .then((exitCode) => {
        sendMessage(session, { type: "exit", code: exitCode });
      })
      .catch((error) => {
        logger.error("Terminal process failed", error, {
          sessionId: session.id,
        });
        sendMessage(session, {
          type: "error",
          message: "Terminal process terminated unexpectedly.",
        });
      })
      .finally(() => {
        if (session.socket !== undefined) {
          try {
            session.socket.close();
          } catch {
            // Ignore close errors.
          }
        }
        sessionIdByCwd.delete(session.cwd);
        sessions.delete(session.id);
      });
  }

  function flushBufferedOutput(session: TerminalSession): void {
    if (session.bufferedOutput.length === 0) {
      return;
    }
    for (const bufferedChunk of session.bufferedOutput) {
      sendMessage(session, { type: "output", data: bufferedChunk });
    }
    session.bufferedOutput = [];
  }

  function parseClientMessage(
    message: string | Buffer,
  ): TerminalClientMessage | null {
    try {
      const messageString =
        typeof message === "string" ? message : message.toString();
      return JSON.parse(messageString) as TerminalClientMessage;
    } catch {
      return null;
    }
  }

  return {
    createSession(cwd: string): TerminalConnectResult {
      const existingSessionId = sessionIdByCwd.get(cwd);
      if (existingSessionId !== undefined) {
        const existingSession = sessions.get(existingSessionId);
        if (existingSession !== undefined) {
          return {
            sessionId: existingSession.id,
            websocketPath: `/ws/terminal/${existingSession.id}`,
            reused: true,
          };
        }
        sessionIdByCwd.delete(cwd);
      }

      const sessionId = crypto.randomUUID();
      const session: TerminalSession = {
        id: sessionId,
        cwd,
        process: undefined,
        socket: undefined,
        bufferedOutput: [],
        createdAt: Date.now(),
      };
      sessions.set(sessionId, session);
      sessionIdByCwd.set(cwd, sessionId);

      logger.debug("Created terminal session", { sessionId, cwd });

      return {
        sessionId,
        websocketPath: `/ws/terminal/${sessionId}`,
        reused: false,
      };
    },

    hasSession(sessionId: string): boolean {
      return sessions.has(sessionId);
    },

    getSessionByCwd(cwd: string): TerminalSessionInfo | null {
      const sessionId = sessionIdByCwd.get(cwd);
      if (sessionId === undefined) {
        return null;
      }
      const session = sessions.get(sessionId);
      if (session === undefined) {
        sessionIdByCwd.delete(cwd);
        return null;
      }
      return {
        sessionId: session.id,
        websocketPath: `/ws/terminal/${session.id}`,
      };
    },

    handleOpen(sessionId: string, socket: ServerTerminalSocket): void {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        try {
          socket.close(1008, "Unknown terminal session");
        } catch {
          // Ignore close failures.
        }
        return;
      }

      if (session.socket !== undefined && session.socket.readyState === 1) {
        try {
          session.socket.close(1012, "Terminal reconnected from another tab");
        } catch {
          // Ignore close failures.
        }
      }

      session.socket = socket;
      socketToSessionId.set(socket, session.id);

      spawnShellProcess(session);
      flushBufferedOutput(session);

      logger.debug("Terminal WebSocket connected", {
        sessionId,
        ageMs: Date.now() - session.createdAt,
      });
    },

    handleMessage(
      socket: ServerTerminalSocket,
      message: string | Buffer,
    ): void {
      const sessionId = socketToSessionId.get(socket);
      if (sessionId === undefined) {
        return;
      }

      const session = sessions.get(sessionId);
      if (session === undefined) {
        return;
      }

      const clientMessage = parseClientMessage(message);
      if (clientMessage === null) {
        sendMessage(session, {
          type: "error",
          message: "Invalid terminal message format.",
        });
        return;
      }

      if (clientMessage.type === "ping") {
        sendMessage(session, { type: "pong" });
        return;
      }

      if (clientMessage.type === "input") {
        if (session.process === undefined) {
          return;
        }
        try {
          session.process.stdin.write(clientMessage.data);
        } catch (error) {
          logger.error("Failed to write to terminal stdin", error, {
            sessionId,
          });
          sendMessage(session, {
            type: "error",
            message: "Failed to write to terminal process.",
          });
        }
      }
    },

    handleClose(socket: ServerTerminalSocket): void {
      const sessionId = socketToSessionId.get(socket);
      if (sessionId === undefined) {
        return;
      }

      const session = sessions.get(sessionId);
      if (session === undefined) {
        return;
      }

      if (session.socket === socket) {
        session.socket = undefined;
      }
      logger.debug("Terminal socket detached", { sessionId });
    },

    closeSessionByCwd(cwd: string): boolean {
      const sessionId = sessionIdByCwd.get(cwd);
      if (sessionId === undefined) {
        return false;
      }
      this.closeSession(sessionId);
      return true;
    },

    closeSession(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return;
      }

      if (session.socket !== undefined) {
        try {
          session.socket.close();
        } catch {
          // Ignore close failures.
        }
      }

      if (session.process !== undefined) {
        try {
          session.process.kill();
        } catch {
          // Ignore kill failures.
        }
      }

      sessionIdByCwd.delete(session.cwd);
      sessions.delete(sessionId);
    },

    closeAll(): void {
      for (const sessionId of sessions.keys()) {
        this.closeSession(sessionId);
      }
    },
  };
}

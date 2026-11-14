import type { TerminalConnectResponse } from "../../../../client-shared/src/api/terminal";

export interface TerminalServerOutputMessage {
  readonly type: "output";
  readonly data: string;
}

export interface TerminalServerExitMessage {
  readonly type: "exit";
  readonly code: number;
}

export interface TerminalServerErrorMessage {
  readonly type: "error";
  readonly message: string;
}

export interface TerminalServerPongMessage {
  readonly type: "pong";
}

export type TerminalServerMessage =
  | TerminalServerOutputMessage
  | TerminalServerExitMessage
  | TerminalServerErrorMessage
  | TerminalServerPongMessage;

export interface BrowserLocationLike {
  readonly protocol: string;
  readonly host: string;
}

const MAX_TERMINAL_BUFFER_CHARS = 20_000;

export function buildTerminalWebSocketUrl(
  connectResponse: Pick<
    TerminalConnectResponse,
    "websocketPath" | "websocketUrl"
  >,
  locationLike: BrowserLocationLike,
): string {
  if (connectResponse.websocketUrl.length > 0) {
    return connectResponse.websocketUrl;
  }

  const websocketProtocol = locationLike.protocol === "https:" ? "wss:" : "ws:";
  return `${websocketProtocol}//${locationLike.host}${connectResponse.websocketPath}`;
}

export function appendTerminalOutput(
  currentOutput: string,
  nextChunk: string,
): string {
  const nextOutput = `${currentOutput}${nextChunk}`;
  if (nextOutput.length <= MAX_TERMINAL_BUFFER_CHARS) {
    return nextOutput;
  }

  return nextOutput.slice(nextOutput.length - MAX_TERMINAL_BUFFER_CHARS);
}

export function parseTerminalServerMessage(
  payload: string,
): TerminalServerMessage | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed["type"] === "output" && typeof parsed["data"] === "string") {
      return {
        type: "output",
        data: parsed["data"],
      };
    }

    if (parsed["type"] === "exit" && typeof parsed["code"] === "number") {
      return {
        type: "exit",
        code: parsed["code"],
      };
    }

    if (parsed["type"] === "error" && typeof parsed["message"] === "string") {
      return {
        type: "error",
        message: parsed["message"],
      };
    }

    if (parsed["type"] === "pong") {
      return {
        type: "pong",
      };
    }
  } catch {
    return null;
  }

  return null;
}

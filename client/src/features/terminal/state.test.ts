import { describe, expect, test } from "bun:test";
import {
  appendTerminalOutput,
  buildTerminalWebSocketUrl,
  parseTerminalServerMessage,
} from "./state";

describe("terminal state helpers", () => {
  test("prefers the explicit websocket url from the backend", () => {
    expect(
      buildTerminalWebSocketUrl(
        {
          websocketPath: "/ws/terminal/session-1",
          websocketUrl: "ws://127.0.0.1:7155/ws/terminal/session-1",
        },
        {
          protocol: "http:",
          host: "localhost:7155",
        },
      ),
    ).toBe("ws://127.0.0.1:7155/ws/terminal/session-1");
  });

  test("derives a websocket url from browser location when needed", () => {
    expect(
      buildTerminalWebSocketUrl(
        {
          websocketPath: "/ws/terminal/session-2",
          websocketUrl: "",
        },
        {
          protocol: "https:",
          host: "qraftbox.local",
        },
      ),
    ).toBe("wss://qraftbox.local/ws/terminal/session-2");
  });

  test("bounds terminal output growth", () => {
    const paddedOutput = appendTerminalOutput("", "a".repeat(25_000));
    expect(paddedOutput).toHaveLength(20_000);
    expect(paddedOutput).toBe("a".repeat(20_000));
  });

  test("parses supported server websocket messages", () => {
    expect(
      parseTerminalServerMessage(
        JSON.stringify({
          type: "output",
          data: "hello",
        }),
      ),
    ).toEqual({
      type: "output",
      data: "hello",
    });

    expect(
      parseTerminalServerMessage(
        JSON.stringify({
          type: "exit",
          code: 0,
        }),
      ),
    ).toEqual({
      type: "exit",
      code: 0,
    });
  });

  test("rejects malformed terminal websocket payloads", () => {
    expect(parseTerminalServerMessage("not json")).toBeNull();
    expect(
      parseTerminalServerMessage(
        JSON.stringify({
          type: "output",
          data: 1,
        }),
      ),
    ).toBeNull();
  });
});

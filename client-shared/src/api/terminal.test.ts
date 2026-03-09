import { describe, expect, test } from "bun:test";
import { createTerminalApiClient } from "./terminal";

describe("terminal api client", () => {
  test("builds context-scoped terminal routes from the configured api base", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const apiClient = createTerminalApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImplementation: async (input, init): Promise<Response> => {
        calls.push({
          url: String(input),
          method: init?.method ?? "GET",
        });

        if (String(input).includes("/connect")) {
          return new Response(
            JSON.stringify({
              sessionId: "term-1",
              websocketPath: "/ws/terminal/term-1",
              websocketUrl: "ws://localhost/ws/terminal/term-1",
              reused: false,
            }),
            { status: 200 },
          );
        }

        if (String(input).includes("/disconnect")) {
          return new Response(JSON.stringify({ closed: true }), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ hasSession: false }), {
          status: 200,
        });
      },
    });

    await apiClient.connect("ctx 1");
    await apiClient.fetchStatus("ctx 1");
    await apiClient.disconnect("ctx 1");

    expect(calls).toEqual([
      {
        url: "/custom-api/ctx/ctx%201/terminal/connect",
        method: "POST",
      },
      {
        url: "/custom-api/ctx/ctx%201/terminal/status",
        method: "GET",
      },
      {
        url: "/custom-api/ctx/ctx%201/terminal/disconnect",
        method: "POST",
      },
    ]);
  });

  test("surfaces terminal api errors from json responses", async () => {
    const apiClient = createTerminalApiClient({
      fetchImplementation: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "terminal unavailable" }), {
          status: 503,
        }),
    });

    await expect(apiClient.fetchStatus("ctx-1")).rejects.toThrow(
      "terminal unavailable",
    );
  });
});

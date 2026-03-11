import { describe, expect, test } from "bun:test";
import { createFrontendStatusApiClient } from "./frontend-status";

describe("frontend status api client", () => {
  test("fetches the selected frontend and solid support status", async () => {
    const client = createFrontendStatusApiClient({
      apiBaseUrl: "/custom-api/",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            selectedFrontend: "solid",
            solidSupportStatus: {
              hasSourceCheckout: true,
              hasClientSolidDependencies: true,
              hasBuiltSolidBundle: true,
              hasAgentBrowser: false,
              hasRecordedFullMigrationCheck: false,
              hasRecordedBrowserVerification: false,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    });

    await expect(client.fetchFrontendStatus()).resolves.toEqual({
      selectedFrontend: "solid",
      solidSupportStatus: {
        hasSourceCheckout: true,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: true,
        hasAgentBrowser: false,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      },
    });
  });

  test("surfaces json error payloads for failed requests", async () => {
    const client = createFrontendStatusApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "frontend status unavailable" }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    });

    await expect(client.fetchFrontendStatus()).rejects.toThrow(
      "frontend status unavailable",
    );
  });
});

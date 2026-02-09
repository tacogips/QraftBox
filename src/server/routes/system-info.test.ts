/**
 * System Info API Routes Tests
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createSystemInfoRoutes } from "./system-info";
import type { SystemInfo } from "../../types/system-info";

describe("System Info Routes", () => {
  let app: ReturnType<typeof createSystemInfoRoutes>;

  beforeAll(() => {
    app = createSystemInfoRoutes();
  });

  describe("GET /", () => {
    test("returns system information", async () => {
      const response = await app.request("/");

      expect(response.status).toBe(200);

      const body = (await response.json()) as SystemInfo;

      // Verify response structure
      expect(body).toHaveProperty("git");
      expect(body).toHaveProperty("claudeCode");

      // Verify git version info structure
      expect(body.git).toHaveProperty("version");
      expect(body.git).toHaveProperty("error");

      // Verify claudeCode version info structure
      expect(body.claudeCode).toHaveProperty("version");
      expect(body.claudeCode).toHaveProperty("error");

      // Git should be available (version OR error, not both)
      const gitHasVersion = body.git.version !== null;
      const gitHasError = body.git.error !== null;
      expect(gitHasVersion || gitHasError).toBe(true);
      if (gitHasVersion) {
        expect(body.git.error).toBe(null);
      }
      if (gitHasError) {
        expect(body.git.version).toBe(null);
      }

      // Claude Code might not be available, so we just check structure
      const claudeHasVersion = body.claudeCode.version !== null;
      const claudeHasError = body.claudeCode.error !== null;
      expect(claudeHasVersion || claudeHasError).toBe(true);
      if (claudeHasVersion) {
        expect(body.claudeCode.error).toBe(null);
      }
      if (claudeHasError) {
        expect(body.claudeCode.version).toBe(null);
      }
    });

    test("git version has expected format when available", async () => {
      const response = await app.request("/");
      const body = (await response.json()) as SystemInfo;

      if (body.git.version !== null) {
        // Git version should contain a version number pattern
        expect(body.git.version).toMatch(/\d+\.\d+/);
      }
    });

    test("returns valid JSON response", async () => {
      const response = await app.request("/");

      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );

      // Ensure JSON is parseable
      const body = await response.json();
      expect(body).toBeDefined();
    });
  });
});

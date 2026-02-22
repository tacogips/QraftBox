/**
 * System Info API Routes Tests
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createSystemInfoRoutes } from "./system-info";
import type { SystemInfo } from "../../types/system-info";

describe("System Info Routes", () => {
  let app: ReturnType<typeof createSystemInfoRoutes>;

  beforeAll(() => {
    app = createSystemInfoRoutes({
      promptModel: "claude-opus-4-6",
      assistantModel: "claude-opus-4-6",
    });
  });

  describe("GET /", () => {
    test("returns system information", async () => {
      const response = await app.request("/");

      expect(response.status).toBe(200);

      const body = (await response.json()) as SystemInfo;

      // Verify response structure
      expect(body).toHaveProperty("git");
      expect(body).toHaveProperty("claudeCode");
      expect(body).toHaveProperty("codexCode");
      expect(body).toHaveProperty("models");
      expect(body).toHaveProperty("claudeCodeUsage");

      // Verify git version info structure
      expect(body.git).toHaveProperty("version");
      expect(body.git).toHaveProperty("error");

      // Verify claudeCode version info structure
      expect(body.claudeCode).toHaveProperty("version");
      expect(body.claudeCode).toHaveProperty("error");
      expect(body.codexCode).toHaveProperty("version");
      expect(body.codexCode).toHaveProperty("error");

      // Verify model config structure
      expect(body.models).toHaveProperty("promptModel");
      expect(body.models).toHaveProperty("assistantModel");
      expect(body.models.promptModel).toBe("claude-opus-4-6");
      expect(body.models.assistantModel).toBe("claude-opus-4-6");

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

      const codexHasVersion = body.codexCode.version !== null;
      const codexHasError = body.codexCode.error !== null;
      expect(codexHasVersion || codexHasError).toBe(true);
      if (codexHasVersion) {
        expect(body.codexCode.error).toBe(null);
      }
      if (codexHasError) {
        expect(body.codexCode.version).toBe(null);
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

    test("claudeCodeUsage has correct structure when available", async () => {
      const response = await app.request("/");
      const body = (await response.json()) as SystemInfo;

      // claudeCodeUsage might be null if stats-cache.json doesn't exist
      if (body.claudeCodeUsage !== null) {
        // Verify structure
        expect(body.claudeCodeUsage).toHaveProperty("totalSessions");
        expect(body.claudeCodeUsage).toHaveProperty("totalMessages");
        expect(body.claudeCodeUsage).toHaveProperty("firstSessionDate");
        expect(body.claudeCodeUsage).toHaveProperty("lastComputedDate");
        expect(body.claudeCodeUsage).toHaveProperty("modelUsage");
        expect(body.claudeCodeUsage).toHaveProperty("recentDailyActivity");

        // Verify types
        expect(typeof body.claudeCodeUsage.totalSessions).toBe("number");
        expect(typeof body.claudeCodeUsage.totalMessages).toBe("number");
        expect(
          body.claudeCodeUsage.firstSessionDate === null ||
            typeof body.claudeCodeUsage.firstSessionDate === "string",
        ).toBe(true);
        expect(
          body.claudeCodeUsage.lastComputedDate === null ||
            typeof body.claudeCodeUsage.lastComputedDate === "string",
        ).toBe(true);
        expect(typeof body.claudeCodeUsage.modelUsage).toBe("object");
        expect(Array.isArray(body.claudeCodeUsage.recentDailyActivity)).toBe(
          true,
        );

        // Verify recentDailyActivity length (should be <= 14)
        expect(
          body.claudeCodeUsage.recentDailyActivity.length,
        ).toBeLessThanOrEqual(14);

        // If there are model usage entries, verify structure
        const modelNames = Object.keys(body.claudeCodeUsage.modelUsage);
        if (modelNames.length > 0) {
          const firstModel = body.claudeCodeUsage.modelUsage[modelNames[0]!];
          if (firstModel !== undefined) {
            expect(firstModel).toHaveProperty("inputTokens");
            expect(firstModel).toHaveProperty("outputTokens");
            expect(firstModel).toHaveProperty("cacheReadInputTokens");
            expect(firstModel).toHaveProperty("cacheCreationInputTokens");
          }
        }

        // If there are daily activity entries, verify structure
        if (body.claudeCodeUsage.recentDailyActivity.length > 0) {
          const firstEntry = body.claudeCodeUsage.recentDailyActivity[0];
          if (firstEntry !== undefined) {
            expect(firstEntry).toHaveProperty("date");
            expect(typeof firstEntry.date).toBe("string");
          }
        }
      }
    });
  });
});

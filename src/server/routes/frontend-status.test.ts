import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFrontendStatusRoutes,
  detectSolidCutoverEnvironmentStatus,
} from "./frontend-status";
import {
  clearRecordedSolidBrowserVerification,
  clearRecordedSolidMigrationCheck,
  recordSolidBrowserVerificationPassed,
  recordSolidMigrationCheckPassed,
} from "../../config/solid-migration-check";

describe("GET /api/frontend-status", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      clearRecordedSolidBrowserVerification(dir);
      clearRecordedSolidMigrationCheck(dir);
    }
  });

  test("returns the selected frontend and the current Solid cutover environment status", async () => {
    const app = createFrontendStatusRoutes({
      selectedFrontend: "solid",
      getSolidCutoverEnvironmentStatus: () => ({
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: false,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      }),
    });

    const response = await app.request("/");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      selectedFrontend: "solid",
      solidCutoverEnvironmentStatus: {
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: false,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      },
    });
  });

  test("detects a recorded full migration check from the workspace marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    recordSolidMigrationCheckPassed(cwd);

    const originalCwd = process.cwd();
    process.chdir(cwd);

    try {
      expect(detectSolidCutoverEnvironmentStatus()).toEqual(
        expect.objectContaining({
          hasRecordedFullMigrationCheck: true,
          hasRecordedBrowserVerification: false,
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("detects a recorded browser verification marker from the workspace", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    recordSolidBrowserVerificationPassed(cwd);

    const originalCwd = process.cwd();
    process.chdir(cwd);

    try {
      expect(detectSolidCutoverEnvironmentStatus()).toEqual(
        expect.objectContaining({
          hasRecordedBrowserVerification: true,
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});

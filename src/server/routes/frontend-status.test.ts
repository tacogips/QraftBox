import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFrontendStatusRoutes,
  detectSolidSupportStatus,
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

  test("returns the selected frontend and the current Solid support status", async () => {
    const app = createFrontendStatusRoutes({
      selectedFrontend: "current",
      getSolidSupportStatus: () => ({
        hasSourceCheckout: true,
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
      selectedFrontend: "current",
      solidSupportStatus: {
        hasSourceCheckout: true,
        hasClientSolidDependencies: true,
        hasBuiltSolidBundle: false,
        hasAgentBrowser: true,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      },
    });
  });

  test("ignores recorded full migration markers outside a source checkout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "not-qraftbox" }),
    );
    mkdirSync(join(cwd, "client"), { recursive: true });
    writeFileSync(
      join(cwd, "client", "package.json"),
      JSON.stringify({ name: "not-qraftbox-client" }),
    );
    recordSolidMigrationCheckPassed(cwd);

    expect(detectSolidSupportStatus({ searchRoots: [cwd] })).toEqual(
      expect.objectContaining({
        hasSourceCheckout: false,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      }),
    );
  });

  test("ignores recorded browser verification markers outside a source checkout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "not-qraftbox" }),
    );
    mkdirSync(join(cwd, "client"), { recursive: true });
    writeFileSync(
      join(cwd, "client", "package.json"),
      JSON.stringify({ name: "not-qraftbox-client" }),
    );
    recordSolidBrowserVerificationPassed(cwd);

    expect(detectSolidSupportStatus({ searchRoots: [cwd] })).toEqual(
      expect.objectContaining({
        hasSourceCheckout: false,
        hasRecordedBrowserVerification: false,
      }),
    );
  });

  test("detects repo-local verification markers from a source checkout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "qraftbox" }),
    );
    mkdirSync(join(cwd, "client"), { recursive: true });
    writeFileSync(
      join(cwd, "client", "package.json"),
      JSON.stringify({ name: "qraftbox-client" }),
    );
    recordSolidMigrationCheckPassed(cwd);
    recordSolidBrowserVerificationPassed(cwd);

    expect(detectSolidSupportStatus({ searchRoots: [cwd] })).toEqual(
      expect.objectContaining({
        hasSourceCheckout: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }),
    );
  });

  test("does not treat an unrelated repo with a client package as a source checkout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-frontend-status-"));
    createdDirs.push(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "not-qraftbox" }),
    );
    mkdirSync(join(cwd, "client"), { recursive: true });
    writeFileSync(
      join(cwd, "client", "package.json"),
      JSON.stringify({ name: "some-other-client" }),
    );
    recordSolidMigrationCheckPassed(cwd);
    recordSolidBrowserVerificationPassed(cwd);

    expect(detectSolidSupportStatus({ searchRoots: [cwd] })).toEqual(
      expect.objectContaining({
        hasSourceCheckout: false,
        hasRecordedFullMigrationCheck: false,
        hasRecordedBrowserVerification: false,
      }),
    );
  });

  test("detects repo-local support facts from a resolved source root even when cwd is unrelated", () => {
    const repoRoot = mkdtempSync(
      join(tmpdir(), "qraftbox-frontend-status-repo-"),
    );
    const unrelatedCwd = mkdtempSync(
      join(tmpdir(), "qraftbox-frontend-status-unrelated-"),
    );
    createdDirs.push(repoRoot, unrelatedCwd);

    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "qraftbox" }),
    );
    mkdirSync(join(repoRoot, "client", "node_modules", "solid-js"), {
      recursive: true,
    });
    writeFileSync(
      join(repoRoot, "client", "package.json"),
      JSON.stringify({ name: "qraftbox-client" }),
    );
    recordSolidMigrationCheckPassed(repoRoot);
    recordSolidBrowserVerificationPassed(repoRoot);

    const originalCwd = process.cwd();
    process.chdir(unrelatedCwd);

    try {
      expect(detectSolidSupportStatus({ searchRoots: [repoRoot] })).toEqual(
        expect.objectContaining({
          hasSourceCheckout: true,
          hasClientSolidDependencies: true,
          hasRecordedFullMigrationCheck: true,
          hasRecordedBrowserVerification: true,
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("walks upward from nested search roots to find the source checkout", () => {
    const repoRoot = mkdtempSync(
      join(tmpdir(), "qraftbox-frontend-status-repo-"),
    );
    const nestedRuntimeDir = join(repoRoot, "dist", "server", "routes");
    createdDirs.push(repoRoot);

    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "qraftbox" }),
    );
    mkdirSync(join(repoRoot, "client", "node_modules", "solid-js"), {
      recursive: true,
    });
    writeFileSync(
      join(repoRoot, "client", "package.json"),
      JSON.stringify({ name: "qraftbox-client" }),
    );
    mkdirSync(nestedRuntimeDir, { recursive: true });
    recordSolidMigrationCheckPassed(repoRoot);
    recordSolidBrowserVerificationPassed(repoRoot);

    expect(
      detectSolidSupportStatus({ searchRoots: [nestedRuntimeDir] }),
    ).toEqual(
      expect.objectContaining({
        hasSourceCheckout: true,
        hasClientSolidDependencies: true,
        hasRecordedFullMigrationCheck: true,
        hasRecordedBrowserVerification: true,
      }),
    );
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearRecordedSolidBrowserVerification,
  clearRecordedSolidMigrationCheck,
  getSolidBrowserVerificationMarkerPath,
  getSolidMigrationCheckMarkerPath,
  hasRecordedSolidBrowserVerification,
  hasRecordedSolidMigrationCheck,
  recordSolidBrowserVerificationPassed,
  recordSolidMigrationCheckPassed,
} from "./solid-migration-check";

describe("solid migration check marker", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      clearRecordedSolidBrowserVerification(dir);
      clearRecordedSolidMigrationCheck(dir);
    }
  });

  test("records a workspace-local full migration check marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-migration-check-"));
    createdDirs.push(cwd);

    const markerPath = recordSolidMigrationCheckPassed(cwd);

    expect(markerPath).toBe(getSolidMigrationCheckMarkerPath(cwd));
    expect(hasRecordedSolidMigrationCheck(cwd)).toBe(true);

    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      readonly schemaVersion: number;
      readonly command: string;
      readonly status: string;
      readonly recordedAt: string;
    };
    expect(marker.schemaVersion).toBe(1);
    expect(marker.command).toBe("bun run check:frontend:migration");
    expect(marker.status).toBe("passed");
    expect(marker.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("returns false when the marker is missing or invalid", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-migration-check-"));
    createdDirs.push(cwd);

    expect(hasRecordedSolidMigrationCheck(cwd)).toBe(false);

    writeFileSync(getSolidMigrationCheckMarkerPath(cwd), '{"status":"failed"}');
    expect(hasRecordedSolidMigrationCheck(cwd)).toBe(false);
  });

  test("records a workspace-local browser verification marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-browser-check-"));
    createdDirs.push(cwd);

    const markerPath = recordSolidBrowserVerificationPassed(cwd);

    expect(markerPath).toBe(getSolidBrowserVerificationMarkerPath(cwd));
    expect(hasRecordedSolidBrowserVerification(cwd)).toBe(true);

    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      readonly schemaVersion: number;
      readonly command: string;
      readonly status: string;
      readonly recordedAt: string;
    };
    expect(marker.schemaVersion).toBe(1);
    expect(marker.command).toBe(
      "bun run verify:frontend:migration:browser",
    );
    expect(marker.status).toBe("passed");
    expect(marker.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("returns false when the browser verification marker is missing or invalid", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-browser-check-"));
    createdDirs.push(cwd);

    expect(hasRecordedSolidBrowserVerification(cwd)).toBe(false);

    writeFileSync(
      getSolidBrowserVerificationMarkerPath(cwd),
      '{"status":"failed"}',
    );
    expect(hasRecordedSolidBrowserVerification(cwd)).toBe(false);
  });

  test("clears the recorded marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-migration-check-"));
    createdDirs.push(cwd);

    recordSolidMigrationCheckPassed(cwd);
    clearRecordedSolidMigrationCheck(cwd);

    expect(hasRecordedSolidMigrationCheck(cwd)).toBe(false);
  });

  test("clears the recorded browser verification marker", () => {
    const cwd = mkdtempSync(join(tmpdir(), "qraftbox-solid-browser-check-"));
    createdDirs.push(cwd);

    recordSolidBrowserVerificationPassed(cwd);
    clearRecordedSolidBrowserVerification(cwd);

    expect(hasRecordedSolidBrowserVerification(cwd)).toBe(false);
  });
});

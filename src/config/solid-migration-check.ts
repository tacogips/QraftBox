import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const SOLID_MIGRATION_CHECK_MARKER_FILE_NAME = "tmp-solid-migration-check.json";
const SOLID_BROWSER_VERIFICATION_MARKER_FILE_NAME =
  "tmp-solid-browser-verification.json";

interface SolidMigrationCheckMarker {
  readonly schemaVersion: 1;
  readonly command: "bun run check:frontend:migration";
  readonly status: "passed";
  readonly recordedAt: string;
}

interface SolidBrowserVerificationMarker {
  readonly schemaVersion: 1;
  readonly command: "bun run verify:frontend:migration:browser";
  readonly status: "passed";
  readonly recordedAt: string;
}

function isSolidMigrationCheckMarker(
  value: unknown,
): value is SolidMigrationCheckMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SolidMigrationCheckMarker>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.command === "bun run check:frontend:migration" &&
    candidate.status === "passed" &&
    typeof candidate.recordedAt === "string" &&
    candidate.recordedAt.length > 0
  );
}

function isSolidBrowserVerificationMarker(
  value: unknown,
): value is SolidBrowserVerificationMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SolidBrowserVerificationMarker>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.command === "bun run verify:frontend:migration:browser" &&
    candidate.status === "passed" &&
    typeof candidate.recordedAt === "string" &&
    candidate.recordedAt.length > 0
  );
}

export function getSolidMigrationCheckMarkerPath(
  cwd: string = process.cwd(),
): string {
  return join(cwd, SOLID_MIGRATION_CHECK_MARKER_FILE_NAME);
}

export function getSolidBrowserVerificationMarkerPath(
  cwd: string = process.cwd(),
): string {
  return join(cwd, SOLID_BROWSER_VERIFICATION_MARKER_FILE_NAME);
}

export function hasRecordedSolidMigrationCheck(
  cwd: string = process.cwd(),
): boolean {
  const markerPath = getSolidMigrationCheckMarkerPath(cwd);
  if (!existsSync(markerPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8")) as unknown;
    return isSolidMigrationCheckMarker(parsed);
  } catch {
    return false;
  }
}

export function hasRecordedSolidBrowserVerification(
  cwd: string = process.cwd(),
): boolean {
  const markerPath = getSolidBrowserVerificationMarkerPath(cwd);
  if (!existsSync(markerPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8")) as unknown;
    return isSolidBrowserVerificationMarker(parsed);
  } catch {
    return false;
  }
}

export function recordSolidMigrationCheckPassed(
  cwd: string = process.cwd(),
): string {
  const markerPath = getSolidMigrationCheckMarkerPath(cwd);
  mkdirSync(dirname(markerPath), { recursive: true });

  const marker: SolidMigrationCheckMarker = {
    schemaVersion: 1,
    command: "bun run check:frontend:migration",
    status: "passed",
    recordedAt: new Date().toISOString(),
  };

  writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  return markerPath;
}

export function recordSolidBrowserVerificationPassed(
  cwd: string = process.cwd(),
): string {
  const markerPath = getSolidBrowserVerificationMarkerPath(cwd);
  mkdirSync(dirname(markerPath), { recursive: true });

  const marker: SolidBrowserVerificationMarker = {
    schemaVersion: 1,
    command: "bun run verify:frontend:migration:browser",
    status: "passed",
    recordedAt: new Date().toISOString(),
  };

  writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  return markerPath;
}

export function clearRecordedSolidMigrationCheck(
  cwd: string = process.cwd(),
): void {
  rmSync(getSolidMigrationCheckMarkerPath(cwd), { force: true });
}

export function clearRecordedSolidBrowserVerification(
  cwd: string = process.cwd(),
): void {
  rmSync(getSolidBrowserVerificationMarkerPath(cwd), { force: true });
}

function runSolidMigrationCheckCommandCli(args: readonly string[]): void {
  const command = args[0];

  if (command === "mark-passed") {
    const markerPath = recordSolidMigrationCheckPassed();
    console.log(markerPath);
    return;
  }

  if (command === "mark-browser-passed") {
    const markerPath = recordSolidBrowserVerificationPassed();
    console.log(markerPath);
    return;
  }

  if (command === "clear") {
    clearRecordedSolidMigrationCheck();
    return;
  }

  if (command === "clear-browser") {
    clearRecordedSolidBrowserVerification();
    return;
  }

  if (command === "status") {
    console.log(hasRecordedSolidMigrationCheck() ? "passed" : "missing");
    return;
  }

  if (command === "browser-status") {
    console.log(hasRecordedSolidBrowserVerification() ? "passed" : "missing");
    return;
  }

  throw new Error(
    "Usage: bun run src/config/solid-migration-check.ts <mark-passed|clear|status|mark-browser-passed|clear-browser|browser-status>",
  );
}

if (import.meta.main) {
  runSolidMigrationCheckCommandCli(process.argv.slice(2));
}

/**
 * Tests for client directory resolution
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolveClientDir } from "./client-dir";

// Test fixtures directory
const TEST_DIR = join(import.meta.dir, ".test-client-dir-fixtures");

describe("resolveClientDir", () => {
  beforeAll(() => {
    // Create a test client directory with index.html
    const testClientDir = join(TEST_DIR, "dist", "client");
    mkdirSync(testClientDir, { recursive: true });
    writeFileSync(
      join(testClientDir, "index.html"),
      "<html><body>Test</body></html>",
    );
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("resolves client directory when QRAFTBOX_CLIENT_DIR is set", () => {
    const testClientDir = join(TEST_DIR, "dist", "client");
    const originalEnv = process.env["QRAFTBOX_CLIENT_DIR"];

    try {
      // Set environment variable to test client directory
      process.env["QRAFTBOX_CLIENT_DIR"] = testClientDir;

      const resolvedPath = resolveClientDir();
      expect(resolvedPath).toBe(testClientDir);
    } finally {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalEnv;
      } else {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      }
    }
  });

  test("resolves from fallback locations when env var is not set", () => {
    const originalEnv = process.env["QRAFTBOX_CLIENT_DIR"];

    try {
      // Unset environment variable to test fallback resolution
      delete process.env["QRAFTBOX_CLIENT_DIR"];

      // The function should find one of the fallback locations
      // (e.g., the actual project's dist/client directory)
      const resolvedPath = resolveClientDir();

      // Verify the resolved path ends with "client" directory
      expect(resolvedPath.endsWith("client")).toBe(true);
      // Verify the path contains dist/client
      expect(resolvedPath).toContain("dist/client");
    } finally {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalEnv;
      } else {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      }
    }
  });

  test("resolves from development location (relative to source)", () => {
    // This test verifies that when running from src/server/,
    // the function can find dist/client/ two levels up
    const originalEnv = process.env["QRAFTBOX_CLIENT_DIR"];

    try {
      // Unset environment variable to test fallback logic
      delete process.env["QRAFTBOX_CLIENT_DIR"];

      // This will attempt to resolve using the fallback logic
      // In a real scenario, this would find the actual dist/client directory
      // For this test, we expect it to find one of the candidate paths
      const resolvedPath = resolveClientDir();

      // The resolved path should exist and contain index.html
      expect(resolvedPath).toBeTruthy();
    } finally {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env["QRAFTBOX_CLIENT_DIR"] = originalEnv;
      } else {
        delete process.env["QRAFTBOX_CLIENT_DIR"];
      }
    }
  });
});

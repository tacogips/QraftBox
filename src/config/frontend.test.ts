import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  FRONTEND_TARGET_ENV_VAR,
  isFrontendTarget,
  requireFrontendAssets,
  resolveConfiguredFrontend,
  resolveFrontendAssets,
  resolveFrontendTarget,
} from "./frontend";

const frontendFixtureRoot = mkdtempSync(
  join(tmpdir(), "qraftbox-frontend-config-"),
);

afterAll(() => {
  rmSync(frontendFixtureRoot, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env["QRAFTBOX_CLIENT_DIR"];
  delete process.env["QRAFTBOX_CLIENT_LEGACY_DIR"];
});

function createFrontendFixtureDir(frontendDirName: string): string {
  const assetDir = join(frontendFixtureRoot, frontendDirName);
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(
    join(assetDir, "index.html"),
    "<html><body>fixture</body></html>",
  );
  return assetDir;
}

function createEmptyFrontendFixtureDir(frontendDirName: string): string {
  const assetDir = join(frontendFixtureRoot, frontendDirName);
  mkdirSync(assetDir, { recursive: true });
  return assetDir;
}

describe("frontend config", () => {
  test("recognizes valid frontend targets", () => {
    expect(isFrontendTarget("svelte")).toBe(true);
    expect(isFrontendTarget("solid")).toBe(true);
    expect(isFrontendTarget("vue")).toBe(false);
  });

  test("defaults to solid when target is omitted", () => {
    expect(resolveFrontendTarget(undefined)).toBe("solid");
  });

  test("resolves configured frontend from environment when CLI value is omitted", () => {
    const originalValue = process.env[FRONTEND_TARGET_ENV_VAR];

    try {
      process.env[FRONTEND_TARGET_ENV_VAR] = "solid";
      expect(resolveConfiguredFrontend(undefined)).toBe("solid");
    } finally {
      if (originalValue === undefined) {
        delete process.env[FRONTEND_TARGET_ENV_VAR];
      } else {
        process.env[FRONTEND_TARGET_ENV_VAR] = originalValue;
      }
    }
  });

  test("prefers CLI frontend over environment", () => {
    const originalValue = process.env[FRONTEND_TARGET_ENV_VAR];

    try {
      process.env[FRONTEND_TARGET_ENV_VAR] = "solid";
      expect(resolveConfiguredFrontend("svelte")).toBe("svelte");
    } finally {
      if (originalValue === undefined) {
        delete process.env[FRONTEND_TARGET_ENV_VAR];
      } else {
        process.env[FRONTEND_TARGET_ENV_VAR] = originalValue;
      }
    }
  });

  test("throws for unknown frontend target", () => {
    expect(() => resolveFrontendTarget("vue")).toThrow(
      "Invalid frontend target: vue. Must be one of: svelte, solid",
    );
  });

  test("returns a stable fallback path for solid assets", () => {
    const resolvedAssets = resolveFrontendAssets("solid");
    expect(resolvedAssets.target).toBe("solid");
    expect(resolvedAssets.assetRoot.endsWith("dist/client")).toBe(true);
    expect(resolvedAssets.indexPath.endsWith("dist/client/index.html")).toBe(
      true,
    );
  });

  test("throws when required frontend assets are missing", () => {
    process.env["QRAFTBOX_CLIENT_DIR"] =
      createEmptyFrontendFixtureDir("client-missing");

    expect(() => requireFrontendAssets("solid")).toThrow(
      "Frontend assets for 'solid' were not found.",
    );
  });

  test("resolves svelte assets from QRAFTBOX_CLIENT_LEGACY_DIR", () => {
    const svelteAssetDir = createFrontendFixtureDir("client-legacy");
    process.env["QRAFTBOX_CLIENT_LEGACY_DIR"] = svelteAssetDir;

    const resolvedAssets = requireFrontendAssets("svelte");
    expect(resolvedAssets.assetRoot).toBe(svelteAssetDir);
    expect(resolvedAssets.source).toBe(
      "QRAFTBOX_CLIENT_LEGACY_DIR environment variable",
    );
  });

  test("resolves solid assets from QRAFTBOX_CLIENT_DIR", () => {
    const solidAssetDir = createFrontendFixtureDir("client");
    process.env["QRAFTBOX_CLIENT_DIR"] = solidAssetDir;

    const resolvedAssets = requireFrontendAssets("solid");
    expect(resolvedAssets.assetRoot).toBe(solidAssetDir);
    expect(resolvedAssets.source).toBe("QRAFTBOX_CLIENT_DIR environment variable");
  });
});

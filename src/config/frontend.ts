import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";

export type FrontendTarget = "svelte" | "solid";
export const FRONTEND_TARGET_ENV_VAR = "QRAFTBOX_FRONTEND";

export interface FrontendBuildConfig {
  readonly target: FrontendTarget;
  readonly envClientDir: string;
  readonly defaultBuildDirName: string;
}

export interface FrontendAssetCandidate {
  readonly source: string;
  readonly path: string;
}

export interface ResolvedFrontendAssets {
  readonly target: FrontendTarget;
  readonly assetRoot: string;
  readonly indexPath: string;
  readonly exists: boolean;
  readonly source: string;
}

const FRONTEND_BUILD_CONFIGS: Record<FrontendTarget, FrontendBuildConfig> = {
  svelte: {
    target: "svelte",
    envClientDir: "QRAFTBOX_CLIENT_LEGACY_DIR",
    defaultBuildDirName: "client-legacy",
  },
  solid: {
    target: "solid",
    envClientDir: "QRAFTBOX_CLIENT_DIR",
    defaultBuildDirName: "client",
  },
};

export function isFrontendTarget(value: string): value is FrontendTarget {
  return value === "svelte" || value === "solid";
}

export function resolveFrontendTarget(
  value: string | undefined,
): FrontendTarget {
  if (value === undefined) {
    return "solid";
  }

  if (isFrontendTarget(value)) {
    return value;
  }

  throw new Error(
    `Invalid frontend target: ${value}. Must be one of: svelte, solid`,
  );
}

export function resolveConfiguredFrontend(
  cliValue: string | undefined,
): FrontendTarget {
  const envValue = process.env[FRONTEND_TARGET_ENV_VAR];
  return resolveFrontendTarget(cliValue ?? envValue);
}

function containsIndexHtml(directoryPath: string): boolean {
  const indexPath = join(directoryPath, "index.html");
  return existsSync(indexPath);
}

function createCandidatePaths(
  defaultBuildDirName: string,
): readonly FrontendAssetCandidate[] {
  const executableDir = dirname(process.execPath);

  return [
    {
      source: "adjacent to executable",
      path: join(executableDir, "dist", defaultBuildDirName),
    },
    {
      source: "relative to bundle output",
      path: join(import.meta.dir, defaultBuildDirName),
    },
    {
      source: "relative to source file (development)",
      path: resolve(import.meta.dir, "..", "..", "dist", defaultBuildDirName),
    },
    {
      source: "process.cwd() fallback",
      path: join(process.cwd(), "dist", defaultBuildDirName),
    },
  ];
}

export function resolveFrontendAssets(
  target: FrontendTarget,
): ResolvedFrontendAssets {
  const buildConfig = FRONTEND_BUILD_CONFIGS[target];
  const envClientDir = process.env[buildConfig.envClientDir];

  if (envClientDir !== undefined) {
    return {
      target,
      assetRoot: envClientDir,
      indexPath: join(envClientDir, "index.html"),
      exists: containsIndexHtml(envClientDir),
      source: `${buildConfig.envClientDir} environment variable`,
    };
  }

  const candidates = createCandidatePaths(buildConfig.defaultBuildDirName);
  for (const candidate of candidates) {
    if (containsIndexHtml(candidate.path)) {
      return {
        target,
        assetRoot: candidate.path,
        indexPath: join(candidate.path, "index.html"),
        exists: true,
        source: candidate.source,
      };
    }
  }

  const fallbackAssetRoot = join(
    process.cwd(),
    "dist",
    buildConfig.defaultBuildDirName,
  );
  return {
    target,
    assetRoot: fallbackAssetRoot,
    indexPath: join(fallbackAssetRoot, "index.html"),
    exists: false,
    source: "process.cwd() fallback",
  };
}

export function requireFrontendAssets(
  target: FrontendTarget,
): ResolvedFrontendAssets {
  const resolvedAssets = resolveFrontendAssets(target);

  if (resolvedAssets.exists) {
    return resolvedAssets;
  }

  throw new Error(
    `Frontend assets for '${target}' were not found. Expected index.html under ${resolvedAssets.assetRoot}. Build the ${target} frontend or set the appropriate asset directory environment variable.`,
  );
}

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Hono } from "hono";
import type { FrontendTarget } from "../../config/frontend";
import { resolveFrontendAssets } from "../../config/frontend";
import type { FrontendStatusResponse } from "../../../client-shared/src/contracts/frontend-status";
import type { SolidSupportStatus } from "../../../client-shared/src/contracts/frontend-status";
import {
  hasRecordedSolidBrowserVerification,
  hasRecordedSolidMigrationCheck,
} from "../../config/solid-migration-check";

const QRAFTBOX_ROOT_PACKAGE_NAME = "qraftbox";
const QRAFTBOX_CLIENT_PACKAGE_NAME = "qraftbox-client";

function hasPackageJsonName(
  packageJsonPath: string,
  expectedName: string,
): boolean {
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      readonly name?: unknown;
    };
    return parsed.name === expectedName;
  } catch {
    return false;
  }
}

function isQraftBoxSourceCheckoutRoot(rootPath: string): boolean {
  return (
    hasPackageJsonName(
      join(rootPath, "package.json"),
      QRAFTBOX_ROOT_PACKAGE_NAME,
    ) &&
    hasPackageJsonName(
      join(rootPath, "client", "package.json"),
      QRAFTBOX_CLIENT_PACKAGE_NAME,
    )
  );
}

function getSourceCheckoutSearchRoots(): readonly string[] {
  // Walk upward from the runtime module location so both source-tree and
  // bundled/dist execution can recover the repo root when it is present.
  return [import.meta.dir, process.cwd()];
}

function getAncestorPaths(startPath: string): readonly string[] {
  const ancestorPaths: string[] = [];
  let candidatePath = resolve(startPath);

  while (true) {
    ancestorPaths.push(candidatePath);
    const parentPath = dirname(candidatePath);
    if (parentPath === candidatePath) {
      return ancestorPaths;
    }

    candidatePath = parentPath;
  }
}

function findQraftBoxSourceCheckoutRoot(
  searchRoots: readonly string[] = getSourceCheckoutSearchRoots(),
): string | null {
  for (const candidateRoot of searchRoots) {
    for (const ancestorPath of getAncestorPaths(candidateRoot)) {
      if (isQraftBoxSourceCheckoutRoot(ancestorPath)) {
        return ancestorPath;
      }
    }
  }

  return null;
}

function detectClientSolidDependencies(
  sourceCheckoutRoot: string | null,
): boolean {
  if (sourceCheckoutRoot === null) {
    return false;
  }

  return existsSync(
    join(sourceCheckoutRoot, "client", "node_modules", "solid-js"),
  );
}

function detectBuiltSolidBundle(): boolean {
  return resolveFrontendAssets("current").exists;
}

function detectAgentBrowser(): boolean {
  return Bun.which("agent-browser") !== null;
}

export interface DetectSolidSupportStatusOptions {
  readonly searchRoots?: readonly string[] | undefined;
}

export function detectSolidSupportStatus(
  options: DetectSolidSupportStatusOptions = {},
): SolidSupportStatus {
  const sourceCheckoutRoot = findQraftBoxSourceCheckoutRoot(
    options.searchRoots,
  );
  const hasSourceCheckout = sourceCheckoutRoot !== null;

  return {
    hasSourceCheckout,
    hasClientSolidDependencies:
      detectClientSolidDependencies(sourceCheckoutRoot),
    hasBuiltSolidBundle: detectBuiltSolidBundle(),
    hasAgentBrowser: detectAgentBrowser(),
    hasRecordedFullMigrationCheck: hasSourceCheckout
      ? hasRecordedSolidMigrationCheck(sourceCheckoutRoot)
      : false,
    hasRecordedBrowserVerification: hasSourceCheckout
      ? hasRecordedSolidBrowserVerification(sourceCheckoutRoot)
      : false,
  };
}

export interface CreateFrontendStatusRoutesOptions {
  readonly selectedFrontend: FrontendTarget;
  readonly getSolidSupportStatus?: (() => SolidSupportStatus) | undefined;
}

export function createFrontendStatusRoutes(
  options: CreateFrontendStatusRoutesOptions,
): Hono {
  const app = new Hono();
  const getSolidSupportStatus =
    options.getSolidSupportStatus ?? detectSolidSupportStatus;

  app.get("/", (c) => {
    const response: FrontendStatusResponse = {
      selectedFrontend: options.selectedFrontend,
      solidSupportStatus: getSolidSupportStatus(),
    };
    return c.json(response);
  });

  return app;
}

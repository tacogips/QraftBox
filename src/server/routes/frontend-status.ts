import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { FrontendTarget } from "../../config/frontend";
import { resolveFrontendAssets } from "../../config/frontend";
import type { FrontendStatusResponse } from "../../../client-shared/src/contracts/frontend-status";
import type { SolidCutoverEnvironmentStatus } from "../../../client-shared/src/contracts/frontend-status";
import {
  hasRecordedSolidBrowserVerification,
  hasRecordedSolidMigrationCheck,
} from "../../config/solid-migration-check";

function detectClientSolidDependencies(): boolean {
  return existsSync(join(process.cwd(), "client", "node_modules", "solid-js"));
}

function detectBuiltSolidBundle(): boolean {
  return resolveFrontendAssets("solid").exists;
}

function detectAgentBrowser(): boolean {
  return Bun.which("agent-browser") !== null;
}

function detectRecordedFullMigrationCheck(): boolean {
  return hasRecordedSolidMigrationCheck();
}

function detectRecordedBrowserVerification(): boolean {
  return hasRecordedSolidBrowserVerification();
}

export function detectSolidCutoverEnvironmentStatus(): SolidCutoverEnvironmentStatus {
  return {
    hasClientSolidDependencies: detectClientSolidDependencies(),
    hasBuiltSolidBundle: detectBuiltSolidBundle(),
    hasAgentBrowser: detectAgentBrowser(),
    hasRecordedFullMigrationCheck: detectRecordedFullMigrationCheck(),
    hasRecordedBrowserVerification: detectRecordedBrowserVerification(),
  };
}

export interface CreateFrontendStatusRoutesOptions {
  readonly selectedFrontend: FrontendTarget;
  readonly getSolidCutoverEnvironmentStatus?:
    | (() => SolidCutoverEnvironmentStatus)
    | undefined;
}

export function createFrontendStatusRoutes(
  options: CreateFrontendStatusRoutesOptions,
): Hono {
  const app = new Hono();
  const getSolidCutoverEnvironmentStatus =
    options.getSolidCutoverEnvironmentStatus ??
    detectSolidCutoverEnvironmentStatus;

  app.get("/", (c) => {
    const response: FrontendStatusResponse = {
      selectedFrontend: options.selectedFrontend,
      solidCutoverEnvironmentStatus: getSolidCutoverEnvironmentStatus(),
    };
    return c.json(response);
  });

  return app;
}

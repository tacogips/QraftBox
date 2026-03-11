import { describe, expect, test } from "bun:test";
import { createSolidBootstrapState } from "./bootstrap-state";

describe("createSolidBootstrapState", () => {
  test("defaults to packaged-safe support status when runtime status is not loaded yet", () => {
    const bootstrapState = createSolidBootstrapState(
      {
        projectSlug: null,
        screen: "project",
        contextId: null,
        selectedPath: null,
      },
      "/api",
    );

    expect(bootstrapState.supportStatus).toEqual({
      hasSourceCheckout: false,
      hasClientSolidDependencies: false,
      hasBuiltSolidBundle: true,
      hasAgentBrowser: false,
      hasRecordedFullMigrationCheck: false,
      hasRecordedBrowserVerification: false,
    });
  });
});

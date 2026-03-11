import { describe, expect, test } from "bun:test";
import {
  PACKAGED_RUNTIME_SOLID_SUPPORT_STATUS,
  SOURCE_CHECKOUT_SOLID_SUPPORT_STATUS,
} from "./support-status";

describe("support-status baselines", () => {
  test("keeps the packaged runtime baseline free of repo-only assumptions", () => {
    expect(PACKAGED_RUNTIME_SOLID_SUPPORT_STATUS).toEqual({
      hasSourceCheckout: false,
      hasClientSolidDependencies: false,
      hasBuiltSolidBundle: true,
      hasAgentBrowser: false,
      hasRecordedFullMigrationCheck: false,
      hasRecordedBrowserVerification: false,
    });
  });

  test("keeps the source-checkout baseline explicit for repo validation paths", () => {
    expect(SOURCE_CHECKOUT_SOLID_SUPPORT_STATUS).toEqual({
      hasSourceCheckout: true,
      hasClientSolidDependencies: false,
      hasBuiltSolidBundle: false,
      hasAgentBrowser: false,
      hasRecordedFullMigrationCheck: false,
      hasRecordedBrowserVerification: false,
    });
  });
});

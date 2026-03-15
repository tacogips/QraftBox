import type { SolidSupportStatus } from "../../../client-shared/src/contracts/frontend-status";

export const PACKAGED_RUNTIME_SOLID_SUPPORT_STATUS: SolidSupportStatus = {
  hasSourceCheckout: false,
  hasClientSolidDependencies: false,
  hasBuiltSolidBundle: true,
  hasAgentBrowser: false,
  hasRecordedFullMigrationCheck: false,
  hasRecordedBrowserVerification: false,
};

export const SOURCE_CHECKOUT_SOLID_SUPPORT_STATUS: SolidSupportStatus = {
  hasSourceCheckout: true,
  hasClientSolidDependencies: false,
  hasBuiltSolidBundle: false,
  hasAgentBrowser: false,
  hasRecordedFullMigrationCheck: false,
  hasRecordedBrowserVerification: false,
};

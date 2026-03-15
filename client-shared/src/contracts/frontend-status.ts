export interface SolidSupportStatus {
  readonly hasSourceCheckout: boolean;
  readonly hasClientSolidDependencies: boolean;
  readonly hasBuiltSolidBundle: boolean;
  readonly hasAgentBrowser: boolean;
  readonly hasRecordedFullMigrationCheck: boolean;
  readonly hasRecordedBrowserVerification: boolean;
}

export interface FrontendStatusResponse {
  readonly selectedFrontend: "svelte" | "current";
  readonly solidSupportStatus: SolidSupportStatus;
}

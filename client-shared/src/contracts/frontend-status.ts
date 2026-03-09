export interface SolidCutoverEnvironmentStatus {
  readonly hasClientSolidDependencies: boolean;
  readonly hasBuiltSolidBundle: boolean;
  readonly hasAgentBrowser: boolean;
  readonly hasRecordedFullMigrationCheck: boolean;
  readonly hasRecordedBrowserVerification: boolean;
}

export interface FrontendStatusResponse {
  readonly selectedFrontend: "svelte" | "solid";
  readonly solidCutoverEnvironmentStatus: SolidCutoverEnvironmentStatus;
}

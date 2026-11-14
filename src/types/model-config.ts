/**
 * Model configuration types
 *
 * Named model profiles and per-operation profile bindings.
 */

export type ModelVendor = "anthropics" | "openai";
export type ModelAuthMode = "cli_auth" | "api_key";

export interface ModelProfile {
  readonly id: string;
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly authMode: ModelAuthMode;
  readonly model: string;
  readonly arguments: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewModelProfileInput {
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly authMode?: ModelAuthMode | undefined;
  readonly model: string;
  readonly arguments: readonly string[];
}

export interface UpdateModelProfileInput {
  readonly name?: string | undefined;
  readonly vendor?: ModelVendor | undefined;
  readonly authMode?: ModelAuthMode | undefined;
  readonly model?: string | undefined;
  readonly arguments?: readonly string[] | undefined;
}

export interface OperationModelBindings {
  readonly gitCommitProfileId: string | null;
  readonly gitPrProfileId: string | null;
  readonly aiDefaultProfileId: string | null;
}

export interface OperationLanguageSettings {
  readonly gitCommitLanguage: string;
  readonly gitPrLanguage: string;
  readonly aiSessionPurposeLanguage: string;
}

export interface UpdateOperationModelBindingsInput {
  readonly gitCommitProfileId?: string | null;
  readonly gitPrProfileId?: string | null;
  readonly aiDefaultProfileId?: string | null;
}

export interface UpdateOperationLanguageSettingsInput {
  readonly gitCommitLanguage?: string | undefined;
  readonly gitPrLanguage?: string | undefined;
  readonly aiSessionPurposeLanguage?: string | undefined;
}

export type ModelOperation = "git_commit" | "git_pr" | "ai_ask";
export type OperationLanguageTarget =
  | "git_commit"
  | "git_pr"
  | "ai_session_purpose";

export interface ResolvedModelProfile {
  readonly profileId: string;
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly authMode: ModelAuthMode;
  readonly model: string;
  readonly arguments: readonly string[];
}

export interface ModelConfigState {
  readonly profiles: readonly ModelProfile[];
  readonly operationBindings: OperationModelBindings;
  readonly operationLanguages: OperationLanguageSettings;
}

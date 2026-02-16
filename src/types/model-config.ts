/**
 * Model configuration types
 *
 * Named model profiles and per-operation profile bindings.
 */

export type ModelVendor = "anthropics" | "openai";

export interface ModelProfile {
  readonly id: string;
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly model: string;
  readonly arguments: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewModelProfileInput {
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly model: string;
  readonly arguments: readonly string[];
}

export interface UpdateModelProfileInput {
  readonly name?: string | undefined;
  readonly vendor?: ModelVendor | undefined;
  readonly model?: string | undefined;
  readonly arguments?: readonly string[] | undefined;
}

export interface OperationModelBindings {
  readonly gitCommitProfileId: string | null;
  readonly gitPrProfileId: string | null;
  readonly aiDefaultProfileId: string | null;
}

export interface UpdateOperationModelBindingsInput {
  readonly gitCommitProfileId?: string | null;
  readonly gitPrProfileId?: string | null;
  readonly aiDefaultProfileId?: string | null;
}

export type ModelOperation = "git_commit" | "git_pr" | "ai_ask";

export interface ResolvedModelProfile {
  readonly profileId: string;
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly model: string;
  readonly arguments: readonly string[];
}

export interface ModelConfigState {
  readonly profiles: readonly ModelProfile[];
  readonly operationBindings: OperationModelBindings;
}

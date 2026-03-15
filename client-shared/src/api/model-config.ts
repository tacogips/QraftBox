import type {
  ModelAuthMode,
  ModelConfigState,
  ModelProfile,
  ModelVendor,
  OperationLanguageSettings,
  OperationModelBindings,
} from "../../../src/types/model-config";
import type {
  PromptCategory,
  PromptTemplate,
} from "../../../src/types/prompt-config";
import { resolveFetchImplementation } from "./fetch";

export type GitActionPromptName =
  | "commit"
  | "create-pr"
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

export interface EffectivePromptResponse {
  readonly name: GitActionPromptName;
  readonly path: string;
  readonly content: string;
  readonly source: "file" | "fallback";
}

export interface ModelConfigApiClientOptions {
  readonly fetchImplementation?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface ModelConfigApiClient {
  fetchModelConfigState(): Promise<ModelConfigState>;
  createModelProfile(input: {
    readonly name: string;
    readonly vendor: ModelVendor;
    readonly authMode?: ModelAuthMode | undefined;
    readonly model: string;
    readonly arguments: readonly string[];
  }): Promise<ModelProfile>;
  updateModelProfile(
    profileId: string,
    input: {
      readonly name?: string | undefined;
      readonly vendor?: ModelVendor | undefined;
      readonly authMode?: ModelAuthMode | undefined;
      readonly model?: string | undefined;
      readonly arguments?: readonly string[] | undefined;
    },
  ): Promise<ModelProfile>;
  deleteModelProfile(profileId: string): Promise<void>;
  updateModelBindings(
    bindings: Partial<OperationModelBindings>,
  ): Promise<OperationModelBindings>;
  updateModelLanguages(
    operationLanguages: Partial<OperationLanguageSettings>,
  ): Promise<OperationLanguageSettings>;
  fetchPromptTemplates(
    contextId: string,
    category?: PromptCategory | undefined,
  ): Promise<readonly PromptTemplate[]>;
  fetchDefaultPromptId(
    contextId: string,
    category: Extract<PromptCategory, "commit" | "pr">,
  ): Promise<string | null>;
  updateDefaultPromptId(
    contextId: string,
    category: Extract<PromptCategory, "commit" | "pr">,
    id: string,
  ): Promise<void>;
  fetchGitActionPrompt(
    name: GitActionPromptName,
  ): Promise<EffectivePromptResponse>;
  updateGitActionPrompt(
    name: GitActionPromptName,
    content: string,
  ): Promise<EffectivePromptResponse>;
}

interface ModelConfigApiClientConfig {
  readonly fetchImplementation: typeof fetch;
  readonly apiBaseUrl: string;
}

interface ErrorResponse {
  readonly error?: string | undefined;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
}

function createModelConfigApiClientConfig(
  options: ModelConfigApiClientOptions = {},
): ModelConfigApiClientConfig {
  return {
    fetchImplementation: resolveFetchImplementation(
      options.fetchImplementation,
    ),
    apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl ?? "/api"),
  };
}

async function ensureOk(
  response: Response,
  message: string,
): Promise<Response> {
  if (!response.ok) {
    let detail = `${message}: ${response.status}`;

    try {
      const errorPayload = (await response.json()) as ErrorResponse;
      if (
        typeof errorPayload.error === "string" &&
        errorPayload.error.length > 0
      ) {
        detail = errorPayload.error;
      }
    } catch {
      // Keep the response-status fallback when the payload is not JSON.
    }

    throw new Error(detail);
  }

  return response;
}

function buildPromptTemplatesUrl(
  config: ModelConfigApiClientConfig,
  contextId: string,
  category?: PromptCategory | undefined,
): string {
  const searchParams = new URLSearchParams();
  if (category !== undefined) {
    searchParams.set("category", category);
  }

  const baseUrl = `${config.apiBaseUrl}/ctx/${encodeURIComponent(
    contextId,
  )}/prompts`;
  const query = searchParams.toString();
  return query.length > 0 ? `${baseUrl}?${query}` : baseUrl;
}

export function createModelConfigApiClient(
  options: ModelConfigApiClientOptions = {},
): ModelConfigApiClient {
  const config = createModelConfigApiClientConfig(options);

  return {
    async fetchModelConfigState(): Promise<ModelConfigState> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config`,
      );
      await ensureOk(response, "Model config API error");
      return (await response.json()) as ModelConfigState;
    },
    async createModelProfile(input): Promise<ModelProfile> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config/profiles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await ensureOk(response, "Failed to create model profile");
      const payload = (await response.json()) as {
        readonly profile: ModelProfile;
      };
      return payload.profile;
    },
    async updateModelProfile(profileId, input): Promise<ModelProfile> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config/profiles/${encodeURIComponent(
          profileId,
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await ensureOk(response, "Failed to update model profile");
      const payload = (await response.json()) as {
        readonly profile: ModelProfile;
      };
      return payload.profile;
    },
    async deleteModelProfile(profileId): Promise<void> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config/profiles/${encodeURIComponent(
          profileId,
        )}`,
        {
          method: "DELETE",
        },
      );
      await ensureOk(response, "Failed to delete model profile");
    },
    async updateModelBindings(bindings): Promise<OperationModelBindings> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config/bindings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bindings),
        },
      );
      await ensureOk(response, "Failed to update model bindings");
      const payload = (await response.json()) as {
        readonly operationBindings: OperationModelBindings;
      };
      return payload.operationBindings;
    },
    async updateModelLanguages(
      operationLanguages,
    ): Promise<OperationLanguageSettings> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/model-config/languages`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(operationLanguages),
        },
      );
      await ensureOk(response, "Failed to update operation languages");
      const payload = (await response.json()) as {
        readonly operationLanguages: OperationLanguageSettings;
      };
      return payload.operationLanguages;
    },
    async fetchPromptTemplates(
      contextId,
      category,
    ): Promise<readonly PromptTemplate[]> {
      const response = await config.fetchImplementation(
        buildPromptTemplatesUrl(config, contextId, category),
      );
      await ensureOk(response, "Failed to fetch prompt templates");
      const payload = (await response.json()) as {
        readonly prompts: readonly PromptTemplate[];
      };
      return payload.prompts;
    },
    async fetchDefaultPromptId(contextId, category): Promise<string | null> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(
          contextId,
        )}/prompts/default/${category}`,
      );
      await ensureOk(response, "Failed to fetch default prompt");
      const payload = (await response.json()) as {
        readonly defaultId: string | null;
      };
      return payload.defaultId;
    },
    async updateDefaultPromptId(contextId, category, id): Promise<void> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/ctx/${encodeURIComponent(
          contextId,
        )}/prompts/default/${category}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      );
      await ensureOk(response, "Failed to update default prompt");
    },
    async fetchGitActionPrompt(name): Promise<EffectivePromptResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/git-actions/prompts/${name}`,
      );
      await ensureOk(response, "Failed to fetch action prompt");
      return (await response.json()) as EffectivePromptResponse;
    },
    async updateGitActionPrompt(
      name,
      content,
    ): Promise<EffectivePromptResponse> {
      const response = await config.fetchImplementation(
        `${config.apiBaseUrl}/git-actions/prompts/${name}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      await ensureOk(response, "Failed to update action prompt");
      return (await response.json()) as EffectivePromptResponse;
    },
  };
}

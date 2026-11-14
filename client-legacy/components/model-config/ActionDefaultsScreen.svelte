<script lang="ts">
  import {
    fetchDefaultPromptIdApi,
    fetchGitActionPromptApi,
    fetchModelConfigState,
    fetchPromptTemplatesApi,
    type GitActionPromptName,
    updateDefaultPromptIdApi,
    updateGitActionPromptApi,
    updateModelBindingsApi,
    updateModelLanguagesApi,
  } from "../../src/lib/app-api";
  import type {
    ModelConfigState,
    ModelProfile,
    OperationLanguageSettings,
    OperationModelBindings,
  } from "../../../src/types/model-config";
  import type { PromptTemplate } from "../../../src/types/prompt-config";

  let { contextId }: { contextId: string | null } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  let profiles = $state<ModelProfile[]>([]);
  let bindings = $state<OperationModelBindings>({
    gitCommitProfileId: null,
    gitPrProfileId: null,
    aiDefaultProfileId: null,
  });
  let operationLanguages = $state<OperationLanguageSettings>({
    gitCommitLanguage: "English",
    gitPrLanguage: "English",
    aiSessionPurposeLanguage: "English",
  });

  let commitPromptText = $state("");
  let prPromptText = $state("");
  let sessionPurposePromptText = $state("");
  let sessionRefreshPurposePromptText = $state("");
  let sessionResumePromptText = $state("");

  let commitPromptPath = $state("");
  let prPromptPath = $state("");
  let sessionPurposePromptPath = $state("");
  let sessionRefreshPurposePromptPath = $state("");
  let sessionResumePromptPath = $state("");

  let commitTemplates = $state<readonly PromptTemplate[]>([]);
  let prTemplates = $state<readonly PromptTemplate[]>([]);
  let selectedCommitPromptTemplateId = $state("");
  let selectedPrPromptTemplateId = $state("");

  function showNotice(message: string): void {
    notice = message;
    setTimeout(() => {
      notice = null;
    }, 2000);
  }

  async function load(): Promise<void> {
    if (contextId === null) {
      error = "No active project context";
      loading = false;
      return;
    }

    try {
      loading = true;
      error = null;

      const [
        state,
        commitPrompt,
        prPrompt,
        sessionPurposePrompt,
        sessionRefreshPurposePrompt,
        sessionResumePrompt,
        commitTemplateList,
        prTemplateList,
        commitDefaultPromptId,
        prDefaultPromptId,
      ] = await Promise.all([
        fetchModelConfigState(),
        fetchGitActionPromptApi("commit"),
        fetchGitActionPromptApi("create-pr"),
        fetchGitActionPromptApi("ai-session-purpose"),
        fetchGitActionPromptApi("ai-session-refresh-purpose"),
        fetchGitActionPromptApi("ai-session-resume"),
        fetchPromptTemplatesApi(contextId, "commit"),
        fetchPromptTemplatesApi(contextId, "pr"),
        fetchDefaultPromptIdApi(contextId, "commit"),
        fetchDefaultPromptIdApi(contextId, "pr"),
      ]);

      const modelState = state as ModelConfigState;
      profiles = [...modelState.profiles];
      bindings = modelState.operationBindings;
      operationLanguages = modelState.operationLanguages;

      commitPromptText = commitPrompt.content;
      prPromptText = prPrompt.content;
      sessionPurposePromptText = sessionPurposePrompt.content;
      sessionRefreshPurposePromptText = sessionRefreshPurposePrompt.content;
      sessionResumePromptText = sessionResumePrompt.content;

      commitPromptPath = commitPrompt.path;
      prPromptPath = prPrompt.path;
      sessionPurposePromptPath = sessionPurposePrompt.path;
      sessionRefreshPurposePromptPath = sessionRefreshPurposePrompt.path;
      sessionResumePromptPath = sessionResumePrompt.path;

      commitTemplates = commitTemplateList;
      prTemplates = prTemplateList;
      selectedCommitPromptTemplateId = commitDefaultPromptId ?? "";
      selectedPrPromptTemplateId = prDefaultPromptId ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load action defaults";
    } finally {
      loading = false;
    }
  }

  function profileOptionLabel(profile: ModelProfile): string {
    return profile.name;
  }

  function profileSummary(profileId: string | null): string {
    if (profileId === null) {
      return "No profile selected";
    }
    const profile = profiles.find((item) => item.id === profileId);
    if (profile === undefined) {
      return "Selected profile is unavailable";
    }
    return `${profile.vendor} / ${profile.model}`;
  }

  async function saveBindings(): Promise<void> {
    try {
      saving = true;
      error = null;
      bindings = await updateModelBindingsApi(bindings);
      showNotice("Default profiles saved");
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to save default profiles";
    } finally {
      saving = false;
    }
  }

  async function saveLanguages(): Promise<void> {
    try {
      saving = true;
      error = null;
      operationLanguages = await updateModelLanguagesApi(operationLanguages);
      showNotice("Output languages saved");
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to save output languages";
    } finally {
      saving = false;
    }
  }

  async function savePromptDefaults(): Promise<void> {
    if (contextId === null) {
      error = "No active project context";
      return;
    }

    if (selectedCommitPromptTemplateId.length === 0) {
      error = "Commit default prompt template is required";
      return;
    }
    if (selectedPrPromptTemplateId.length === 0) {
      error = "PR default prompt template is required";
      return;
    }

    try {
      saving = true;
      error = null;
      await Promise.all([
        updateDefaultPromptIdApi(
          contextId,
          "commit",
          selectedCommitPromptTemplateId,
        ),
        updateDefaultPromptIdApi(contextId, "pr", selectedPrPromptTemplateId),
      ]);
      showNotice("Default prompt templates saved");
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Failed to save default prompt templates";
    } finally {
      saving = false;
    }
  }

  async function saveActionPrompt(name: GitActionPromptName): Promise<void> {
    try {
      saving = true;
      error = null;

      const content =
        name === "commit"
          ? commitPromptText
          : name === "create-pr"
            ? prPromptText
            : name === "ai-session-purpose"
              ? sessionPurposePromptText
              : name === "ai-session-refresh-purpose"
                ? sessionRefreshPurposePromptText
                : sessionResumePromptText;

      const updated = await updateGitActionPromptApi(name, content);

      if (name === "commit") {
        commitPromptText = updated.content;
        commitPromptPath = updated.path;
      } else if (name === "create-pr") {
        prPromptText = updated.content;
        prPromptPath = updated.path;
      } else if (name === "ai-session-purpose") {
        sessionPurposePromptText = updated.content;
        sessionPurposePromptPath = updated.path;
      } else if (name === "ai-session-refresh-purpose") {
        sessionRefreshPurposePromptText = updated.content;
        sessionRefreshPurposePromptPath = updated.path;
      } else {
        sessionResumePromptText = updated.content;
        sessionResumePromptPath = updated.path;
      }

      showNotice(`Saved ${name} prompt`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save action prompt";
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    contextId;
    void load();
  });
</script>

<div
  class="h-full flex flex-col bg-bg-primary"
  role="main"
  aria-label="Action defaults"
>
  <div class="px-4 py-3 border-b border-border-default bg-bg-secondary">
    <h2 class="text-lg font-semibold text-text-primary">Action Defaults</h2>
    <p class="text-xs text-text-secondary mt-1">
      Assign default profiles and execution prompts for each AI-driven action.
    </p>
  </div>

  <div class="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4">
    {#if loading}
      <p class="text-sm text-text-secondary">Loading action defaults...</p>
    {:else}
      {#if error !== null}
        <div
          class="rounded border border-danger-emphasis bg-danger-subtle text-danger-fg px-3 py-2 text-sm"
        >
          {error}
        </div>
      {/if}

      {#if notice !== null}
        <div
          class="rounded border border-success-emphasis bg-success-subtle text-success-fg px-3 py-2 text-sm"
        >
          {notice}
        </div>
      {/if}

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3"
      >
        <h3 class="text-sm font-semibold text-text-primary">
          Default Profiles
        </h3>

        <label class="block text-sm">
          <span class="text-text-secondary">Git Commit action profile</span>
          <select
            class="mt-1 w-full min-w-0 max-w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.gitCommitProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileOptionLabel(profile)}</option>
            {/each}
          </select>
          <p class="mt-1 text-xs text-text-tertiary break-all">
            {profileSummary(bindings.gitCommitProfileId)}
          </p>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Git PR action profile</span>
          <select
            class="mt-1 w-full min-w-0 max-w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.gitPrProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileOptionLabel(profile)}</option>
            {/each}
          </select>
          <p class="mt-1 text-xs text-text-tertiary break-all">
            {profileSummary(bindings.gitPrProfileId)}
          </p>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">AI Ask default profile</span>
          <select
            class="mt-1 w-full min-w-0 max-w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.aiDefaultProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileOptionLabel(profile)}</option>
            {/each}
          </select>
          <p class="mt-1 text-xs text-text-tertiary break-all">
            {profileSummary(bindings.aiDefaultProfileId)}
          </p>
        </label>

        <button
          type="button"
          class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
          disabled={saving || profiles.length === 0}
          onclick={() => void saveBindings()}
        >
          Save default profiles
        </button>
      </section>

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3"
      >
        <h3 class="text-sm font-semibold text-text-primary">
          Default Prompt Templates
        </h3>

        <label class="block text-sm">
          <span class="text-text-secondary">Git Commit default prompt</span>
          <select
            class="mt-1 w-full min-w-0 max-w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={selectedCommitPromptTemplateId}
          >
            {#each commitTemplates as template (template.id)}
              <option value={template.id}>{template.name}</option>
            {/each}
          </select>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Git PR default prompt</span>
          <select
            class="mt-1 w-full min-w-0 max-w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={selectedPrPromptTemplateId}
          >
            {#each prTemplates as template (template.id)}
              <option value={template.id}>{template.name}</option>
            {/each}
          </select>
        </label>

        <button
          type="button"
          class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
          disabled={saving ||
            commitTemplates.length === 0 ||
            prTemplates.length === 0}
          onclick={() => void savePromptDefaults()}
        >
          Save prompt template defaults
        </button>
      </section>

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3"
      >
        <h3 class="text-sm font-semibold text-text-primary">Output Language</h3>

        <label class="block text-sm">
          <span class="text-text-secondary">Git Commit</span>
          <input
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={operationLanguages.gitCommitLanguage}
            list="action-language-options"
            placeholder="English / Japanese / ..."
          />
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Git PR</span>
          <input
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={operationLanguages.gitPrLanguage}
            list="action-language-options"
            placeholder="English / Japanese / ..."
          />
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">AI Session Purpose Summary</span>
          <input
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={operationLanguages.aiSessionPurposeLanguage}
            list="action-language-options"
            placeholder="English / Japanese / ..."
          />
        </label>

        <datalist id="action-language-options">
          <option value="English"></option>
          <option value="Japanese"></option>
          <option value="Spanish"></option>
          <option value="French"></option>
          <option value="German"></option>
          <option value="Chinese"></option>
          <option value="Korean"></option>
        </datalist>

        <button
          type="button"
          class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
          disabled={saving}
          onclick={() => void saveLanguages()}
        >
          Save output languages
        </button>
      </section>

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-4"
      >
        <h3 class="text-sm font-semibold text-text-primary">
          Action Execution Prompts
        </h3>

        <div class="space-y-2">
          <div class="text-sm font-medium text-text-primary">
            Git Commit prompt
          </div>
          <div class="text-xs text-text-tertiary font-mono break-all">
            {commitPromptPath}
          </div>
          <textarea
            rows="8"
            class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs font-mono"
            bind:value={commitPromptText}
          ></textarea>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
            disabled={saving}
            onclick={() => void saveActionPrompt("commit")}
          >
            Save commit execution prompt
          </button>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium text-text-primary">Git PR prompt</div>
          <div class="text-xs text-text-tertiary font-mono break-all">
            {prPromptPath}
          </div>
          <textarea
            rows="8"
            class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs font-mono"
            bind:value={prPromptText}
          ></textarea>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
            disabled={saving}
            onclick={() => void saveActionPrompt("create-pr")}
          >
            Save PR execution prompt
          </button>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium text-text-primary">
            AI Session Purpose prompt
          </div>
          <div class="text-xs text-text-tertiary font-mono break-all">
            {sessionPurposePromptPath}
          </div>
          <textarea
            rows="8"
            class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs font-mono"
            bind:value={sessionPurposePromptText}
          ></textarea>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
            disabled={saving}
            onclick={() => void saveActionPrompt("ai-session-purpose")}
          >
            Save session-purpose prompt
          </button>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium text-text-primary">
            AI Session Refresh Purpose prompt
          </div>
          <div class="text-xs text-text-tertiary font-mono break-all">
            {sessionRefreshPurposePromptPath}
          </div>
          <textarea
            rows="4"
            class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs font-mono"
            bind:value={sessionRefreshPurposePromptText}
          ></textarea>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
            disabled={saving}
            onclick={() => void saveActionPrompt("ai-session-refresh-purpose")}
          >
            Save refresh-purpose prompt
          </button>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium text-text-primary">
            AI Session Resume prompt
          </div>
          <div class="text-xs text-text-tertiary font-mono break-all">
            {sessionResumePromptPath}
          </div>
          <textarea
            rows="3"
            class="w-full rounded border border-border-default bg-bg-primary px-2 py-2 text-xs font-mono"
            bind:value={sessionResumePromptText}
          ></textarea>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
            disabled={saving}
            onclick={() => void saveActionPrompt("ai-session-resume")}
          >
            Save resume-session prompt
          </button>
        </div>
      </section>
    {/if}
  </div>
</div>

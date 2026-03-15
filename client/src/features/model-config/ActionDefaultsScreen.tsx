import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import {
  createModelConfigApiClient,
  type GitActionPromptName,
} from "../../../../client-shared/src/api/model-config";
import type {
  ModelConfigState,
  ModelProfile,
  OperationLanguageSettings,
  OperationModelBindings,
} from "../../../../src/types/model-config";
import type { PromptTemplate } from "../../../../src/types/prompt-config";
import { ScreenHeader } from "../../components/ScreenHeader";
import { profileSummary } from "./forms";
import { createLatestActionDefaultsRequestGuard } from "./state";

export interface ActionDefaultsScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
}

const LANGUAGE_OPTIONS = [
  "English",
  "Japanese",
  "Spanish",
  "French",
  "German",
  "Chinese",
  "Korean",
] as const;

const SCREEN_SHELL_CLASS =
  "mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6";
const PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-secondary p-5";
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-emphasis";
const SAVE_BUTTON_CLASS =
  "rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50";

interface BindingControlDefinition {
  readonly key: keyof OperationModelBindings;
  readonly label: string;
  readonly helperLabel: string;
}

interface LanguageControlDefinition {
  readonly key: keyof OperationLanguageSettings;
  readonly label: string;
}

interface PromptEditorDefinition {
  readonly key:
    | "commit"
    | "create-pr"
    | "ai-session-purpose"
    | "ai-session-refresh-purpose"
    | "ai-session-resume";
  readonly title: string;
  readonly description: string;
  readonly getValue: () => string;
  readonly setValue: (nextValue: string) => void;
  readonly getPath: () => string;
}

const BINDING_CONTROL_DEFINITIONS: readonly BindingControlDefinition[] = [
  {
    key: "gitCommitProfileId",
    label: "Git Commit",
    helperLabel: "Profile used for commit message generation.",
  },
  {
    key: "gitPrProfileId",
    label: "Git PR",
    helperLabel: "Profile used when drafting pull requests.",
  },
  {
    key: "aiDefaultProfileId",
    label: "AI Ask",
    helperLabel: "Fallback profile for general AI session work.",
  },
] as const;

const LANGUAGE_CONTROL_DEFINITIONS: readonly LanguageControlDefinition[] = [
  { key: "gitCommitLanguage", label: "Git Commit" },
  { key: "gitPrLanguage", label: "Git PR" },
  { key: "aiSessionPurposeLanguage", label: "AI Session Purpose Summary" },
] as const;

export function ActionDefaultsScreen(
  props: ActionDefaultsScreenProps,
): JSX.Element {
  const modelConfigApi = createModelConfigApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [isLoading, setIsLoading] = createSignal(true);
  const [isSaving, setIsSaving] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  const [profiles, setProfiles] = createSignal<readonly ModelProfile[]>([]);
  const [bindings, setBindings] = createSignal<OperationModelBindings>({
    gitCommitProfileId: null,
    gitPrProfileId: null,
    aiDefaultProfileId: null,
  });
  const [operationLanguages, setOperationLanguages] =
    createSignal<OperationLanguageSettings>({
      gitCommitLanguage: "English",
      gitPrLanguage: "English",
      aiSessionPurposeLanguage: "English",
    });
  const [commitTemplates, setCommitTemplates] = createSignal<
    readonly PromptTemplate[]
  >([]);
  const [prTemplates, setPrTemplates] = createSignal<readonly PromptTemplate[]>(
    [],
  );
  const [selectedCommitPromptTemplateId, setSelectedCommitPromptTemplateId] =
    createSignal("");
  const [selectedPrPromptTemplateId, setSelectedPrPromptTemplateId] =
    createSignal("");

  const [commitPromptText, setCommitPromptText] = createSignal("");
  const [prPromptText, setPrPromptText] = createSignal("");
  const [sessionPurposePromptText, setSessionPurposePromptText] =
    createSignal("");
  const [sessionRefreshPurposePromptText, setSessionRefreshPurposePromptText] =
    createSignal("");
  const [sessionResumePromptText, setSessionResumePromptText] =
    createSignal("");

  const [commitPromptPath, setCommitPromptPath] = createSignal("");
  const [prPromptPath, setPrPromptPath] = createSignal("");
  const [sessionPurposePromptPath, setSessionPurposePromptPath] =
    createSignal("");
  const [sessionRefreshPurposePromptPath, setSessionRefreshPurposePromptPath] =
    createSignal("");
  const [sessionResumePromptPath, setSessionResumePromptPath] =
    createSignal("");
  const loadRequestGuard = createLatestActionDefaultsRequestGuard();
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  function promptEditorDefinitions(): readonly PromptEditorDefinition[] {
    return [
      {
        key: "commit",
        title: "Commit prompt",
        description:
          "Instructions used when generating commit messages from local changes.",
        getValue: commitPromptText,
        setValue: setCommitPromptText,
        getPath: commitPromptPath,
      },
      {
        key: "create-pr",
        title: "PR prompt",
        description:
          "Instructions used when creating pull request summaries from the current branch.",
        getValue: prPromptText,
        setValue: setPrPromptText,
        getPath: prPromptPath,
      },
      {
        key: "ai-session-purpose",
        title: "AI session purpose prompt",
        description:
          "Template used to summarize the initial goal of a coding session.",
        getValue: sessionPurposePromptText,
        setValue: setSessionPurposePromptText,
        getPath: sessionPurposePromptPath,
      },
      {
        key: "ai-session-refresh-purpose",
        title: "AI refresh purpose prompt",
        description:
          "Template used when refreshing a session purpose after context changes.",
        getValue: sessionRefreshPurposePromptText,
        setValue: setSessionRefreshPurposePromptText,
        getPath: sessionRefreshPurposePromptPath,
      },
      {
        key: "ai-session-resume",
        title: "AI resume prompt",
        description:
          "Template used when re-entering an existing session and restoring context.",
        getValue: sessionResumePromptText,
        setValue: setSessionResumePromptText,
        getPath: sessionResumePromptPath,
      },
    ];
  }

  function resetLoadedState(): void {
    setProfiles([]);
    setBindings({
      gitCommitProfileId: null,
      gitPrProfileId: null,
      aiDefaultProfileId: null,
    });
    setOperationLanguages({
      gitCommitLanguage: "English",
      gitPrLanguage: "English",
      aiSessionPurposeLanguage: "English",
    });
    setCommitTemplates([]);
    setPrTemplates([]);
    setSelectedCommitPromptTemplateId("");
    setSelectedPrPromptTemplateId("");
    setCommitPromptText("");
    setPrPromptText("");
    setSessionPurposePromptText("");
    setSessionRefreshPurposePromptText("");
    setSessionResumePromptText("");
    setCommitPromptPath("");
    setPrPromptPath("");
    setSessionPurposePromptPath("");
    setSessionRefreshPurposePromptPath("");
    setSessionResumePromptPath("");
  }

  function showNotice(message: string): void {
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
    }
    setNotice(message);
    noticeTimer = setTimeout(() => {
      setNotice(null);
      noticeTimer = null;
    }, 2_000);
  }

  async function load(contextId: string | null): Promise<void> {
    const requestToken = loadRequestGuard.issue(contextId);
    resetLoadedState();
    setNotice(null);

    if (contextId === null) {
      setErrorMessage("No active project context");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [
        state,
        commitPrompt,
        prPrompt,
        sessionPurposePrompt,
        sessionRefreshPurposePrompt,
        sessionResumePrompt,
        nextCommitTemplates,
        nextPrTemplates,
        commitDefaultPromptId,
        prDefaultPromptId,
      ] = await Promise.all([
        modelConfigApi.fetchModelConfigState(),
        modelConfigApi.fetchGitActionPrompt("commit"),
        modelConfigApi.fetchGitActionPrompt("create-pr"),
        modelConfigApi.fetchGitActionPrompt("ai-session-purpose"),
        modelConfigApi.fetchGitActionPrompt("ai-session-refresh-purpose"),
        modelConfigApi.fetchGitActionPrompt("ai-session-resume"),
        modelConfigApi.fetchPromptTemplates(contextId, "commit"),
        modelConfigApi.fetchPromptTemplates(contextId, "pr"),
        modelConfigApi.fetchDefaultPromptId(contextId, "commit"),
        modelConfigApi.fetchDefaultPromptId(contextId, "pr"),
      ]);

      if (!loadRequestGuard.isCurrent(requestToken)) {
        return;
      }

      const modelState = state as ModelConfigState;
      setProfiles(modelState.profiles);
      setBindings(modelState.operationBindings);
      setOperationLanguages(modelState.operationLanguages);

      setCommitPromptText(commitPrompt.content);
      setPrPromptText(prPrompt.content);
      setSessionPurposePromptText(sessionPurposePrompt.content);
      setSessionRefreshPurposePromptText(sessionRefreshPurposePrompt.content);
      setSessionResumePromptText(sessionResumePrompt.content);

      setCommitPromptPath(commitPrompt.path);
      setPrPromptPath(prPrompt.path);
      setSessionPurposePromptPath(sessionPurposePrompt.path);
      setSessionRefreshPurposePromptPath(sessionRefreshPurposePrompt.path);
      setSessionResumePromptPath(sessionResumePrompt.path);

      setCommitTemplates(nextCommitTemplates);
      setPrTemplates(nextPrTemplates);
      setSelectedCommitPromptTemplateId(commitDefaultPromptId ?? "");
      setSelectedPrPromptTemplateId(prDefaultPromptId ?? "");
    } catch (error) {
      if (!loadRequestGuard.isCurrent(requestToken)) {
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load action defaults",
      );
    } finally {
      if (loadRequestGuard.isCurrent(requestToken)) {
        setIsLoading(false);
      }
    }
  }

  async function saveBindings(): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      setBindings(await modelConfigApi.updateModelBindings(bindings()));
      showNotice("Default profiles saved");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save default profiles",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveLanguages(): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      setOperationLanguages(
        await modelConfigApi.updateModelLanguages(operationLanguages()),
      );
      showNotice("Output languages saved");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save output languages",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function savePromptDefaults(): Promise<void> {
    if (props.contextId === null) {
      setErrorMessage("No active project context");
      return;
    }

    if (selectedCommitPromptTemplateId().length === 0) {
      setErrorMessage("Commit default prompt template is required");
      return;
    }

    if (selectedPrPromptTemplateId().length === 0) {
      setErrorMessage("PR default prompt template is required");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await Promise.all([
        modelConfigApi.updateDefaultPromptId(
          props.contextId,
          "commit",
          selectedCommitPromptTemplateId(),
        ),
        modelConfigApi.updateDefaultPromptId(
          props.contextId,
          "pr",
          selectedPrPromptTemplateId(),
        ),
      ]);
      showNotice("Default prompt templates saved");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save default prompt templates",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveActionPrompt(name: GitActionPromptName): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const content =
        name === "commit"
          ? commitPromptText()
          : name === "create-pr"
            ? prPromptText()
            : name === "ai-session-purpose"
              ? sessionPurposePromptText()
              : name === "ai-session-refresh-purpose"
                ? sessionRefreshPurposePromptText()
                : sessionResumePromptText();
      const updated = await modelConfigApi.updateGitActionPrompt(name, content);

      if (name === "commit") {
        setCommitPromptText(updated.content);
        setCommitPromptPath(updated.path);
      } else if (name === "create-pr") {
        setPrPromptText(updated.content);
        setPrPromptPath(updated.path);
      } else if (name === "ai-session-purpose") {
        setSessionPurposePromptText(updated.content);
        setSessionPurposePromptPath(updated.path);
      } else if (name === "ai-session-refresh-purpose") {
        setSessionRefreshPurposePromptText(updated.content);
        setSessionRefreshPurposePromptPath(updated.path);
      } else {
        setSessionResumePromptText(updated.content);
        setSessionResumePromptPath(updated.path);
      }

      showNotice(`Saved ${name} prompt`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save action prompt",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function getTemplateCountSummary(): string {
    return `${commitTemplates().length} commit templates | ${prTemplates().length} PR templates`;
  }

  createEffect(() => {
    void load(props.contextId);
  });

  onCleanup(() => {
    loadRequestGuard.invalidate();
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
    }
  });

  return (
    <section class={SCREEN_SHELL_CLASS}>
      <ScreenHeader
        title="Action Defaults"
        subtitle="Bind profiles, prompt templates, language preferences, and editable prompt sources for AI-driven commit, PR, and session workflows."
      />

      <Show when={errorMessage() !== null}>
        <div class="rounded-2xl border border-danger-emphasis/40 bg-danger-muted/10 p-4 text-sm text-danger-fg">
          {errorMessage()}
        </div>
      </Show>

      <Show when={notice() !== null}>
        <div class="rounded-2xl border border-success-emphasis/40 bg-success-muted/10 p-4 text-sm text-success-fg">
          {notice()}
        </div>
      </Show>

      <Show when={isLoading()}>
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-6 text-sm text-text-secondary">
          Loading action defaults...
        </div>
      </Show>

      <Show when={!isLoading()}>
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div class="space-y-4">
            <section class={`${PANEL_CLASS} space-y-4`}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                    Default profiles
                  </p>
                  <h3 class="mt-1 text-lg font-semibold text-text-primary">
                    Action to profile bindings
                  </h3>
                </div>
                <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
                  {profiles().length} profiles
                </span>
              </div>

              <For each={BINDING_CONTROL_DEFINITIONS}>
                {(bindingDefinition) => (
                  <label class="block text-sm">
                    <span class="text-text-secondary">
                      {bindingDefinition.label}
                    </span>
                    <select
                      class={FIELD_CLASS}
                      value={bindings()[bindingDefinition.key] ?? ""}
                      onInput={(event) =>
                        setBindings({
                          ...bindings(),
                          [bindingDefinition.key]:
                            event.currentTarget.value.length > 0
                              ? event.currentTarget.value
                              : null,
                        })
                      }
                    >
                      <option value="">No profile selected</option>
                      <For each={profiles()}>
                        {(profile) => (
                          <option value={profile.id}>{profile.name}</option>
                        )}
                      </For>
                    </select>
                    <p class="mt-2 text-xs leading-5 text-text-tertiary">
                      {bindingDefinition.helperLabel}
                    </p>
                    <p class="mt-1 break-words text-xs font-medium text-text-secondary">
                      {profileSummary(
                        bindings()[bindingDefinition.key],
                        profiles(),
                      )}
                    </p>
                  </label>
                )}
              </For>

              <button
                type="button"
                disabled={isSaving() || profiles().length === 0}
                class={SAVE_BUTTON_CLASS}
                onClick={() => void saveBindings()}
              >
                Save default profiles
              </button>
            </section>

            <section class={`${PANEL_CLASS} space-y-4`}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                    Default prompt templates
                  </p>
                  <h3 class="mt-1 text-lg font-semibold text-text-primary">
                    Workspace prompt selection
                  </h3>
                </div>
                <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
                  {getTemplateCountSummary()}
                </span>
              </div>

              <label class="block text-sm">
                <span class="text-text-secondary">Git Commit</span>
                <select
                  class={FIELD_CLASS}
                  value={selectedCommitPromptTemplateId()}
                  onInput={(event) =>
                    setSelectedCommitPromptTemplateId(event.currentTarget.value)
                  }
                >
                  <option value="">No template selected</option>
                  <For each={commitTemplates()}>
                    {(template) => (
                      <option value={template.id}>{template.name}</option>
                    )}
                  </For>
                </select>
              </label>

              <label class="block text-sm">
                <span class="text-text-secondary">Git PR</span>
                <select
                  class={FIELD_CLASS}
                  value={selectedPrPromptTemplateId()}
                  onInput={(event) =>
                    setSelectedPrPromptTemplateId(event.currentTarget.value)
                  }
                >
                  <option value="">No template selected</option>
                  <For each={prTemplates()}>
                    {(template) => (
                      <option value={template.id}>{template.name}</option>
                    )}
                  </For>
                </select>
              </label>

              <button
                type="button"
                disabled={
                  isSaving() ||
                  commitTemplates().length === 0 ||
                  prTemplates().length === 0
                }
                class={SAVE_BUTTON_CLASS}
                onClick={() => void savePromptDefaults()}
              >
                Save prompt template defaults
              </button>
            </section>

            <section class={`${PANEL_CLASS} space-y-4`}>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                  Output language
                </p>
                <h3 class="mt-1 text-lg font-semibold text-text-primary">
                  Generated text language
                </h3>
              </div>

              <For each={LANGUAGE_CONTROL_DEFINITIONS}>
                {(languageDefinition) => (
                  <label class="block text-sm">
                    <span class="text-text-secondary">
                      {languageDefinition.label}
                    </span>
                    <input
                      list="action-language-options"
                      class={FIELD_CLASS}
                      value={operationLanguages()[languageDefinition.key]}
                      onInput={(event) =>
                        setOperationLanguages({
                          ...operationLanguages(),
                          [languageDefinition.key]: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                )}
              </For>

              <button
                type="button"
                disabled={isSaving()}
                class={SAVE_BUTTON_CLASS}
                onClick={() => void saveLanguages()}
              >
                Save output languages
              </button>
            </section>
          </div>

          <section class={`${PANEL_CLASS} min-h-0`}>
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                  Prompt sources
                </p>
                <h3 class="mt-1 text-lg font-semibold text-text-primary">
                  Editable action prompts
                </h3>
              </div>
              <Show when={props.contextId !== null}>
                <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
                  Context attached
                </span>
              </Show>
            </div>

            <div class="mt-5 space-y-4 overflow-auto">
              <For each={promptEditorDefinitions()}>
                {(promptEditor) => (
                  <article class="rounded-2xl border border-border-default bg-bg-primary/60 p-4">
                    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h4 class="text-base font-semibold text-text-primary">
                          {promptEditor.title}
                        </h4>
                        <p class="mt-1 text-sm leading-6 text-text-secondary">
                          {promptEditor.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSaving()}
                        class={SAVE_BUTTON_CLASS}
                        onClick={() => void saveActionPrompt(promptEditor.key)}
                      >
                        Save prompt
                      </button>
                    </div>

                    <Show when={promptEditor.getPath().length > 0}>
                      <p class="mt-3 break-all rounded-xl border border-border-default bg-bg-secondary px-3 py-2 font-mono text-xs text-text-secondary">
                        {promptEditor.getPath()}
                      </p>
                    </Show>

                    <textarea
                      rows={8}
                      class={`${FIELD_CLASS} mt-4 min-h-[180px] resize-y font-mono`}
                      value={promptEditor.getValue()}
                      onInput={(event) =>
                        promptEditor.setValue(event.currentTarget.value)
                      }
                    />
                  </article>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      <datalist id="action-language-options">
        <For each={LANGUAGE_OPTIONS}>
          {(languageOption) => <option value={languageOption} />}
        </For>
      </datalist>
    </section>
  );
}

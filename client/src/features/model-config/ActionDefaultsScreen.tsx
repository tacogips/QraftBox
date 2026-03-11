import { createEffect, createSignal, For, type JSX, onCleanup, Show } from "solid-js";
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
    <section>
      <h2>Action Defaults</h2>
      <p>
        Assign default profiles and execution prompts for AI-driven actions.
      </p>
      <Show when={errorMessage() !== null}>
        <p role="alert">{errorMessage()}</p>
      </Show>
      <Show when={notice() !== null}>
        <p>{notice()}</p>
      </Show>
      <Show when={isLoading()}>
        <p>Loading action defaults...</p>
      </Show>
      <Show when={!isLoading()}>
        <section>
          <h3>Default profiles</h3>
          <label>
            Git Commit
            <select
              value={bindings().gitCommitProfileId ?? ""}
              onInput={(event) =>
                setBindings({
                  ...bindings(),
                  gitCommitProfileId:
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
          </label>
          <p>{profileSummary(bindings().gitCommitProfileId, profiles())}</p>
          <label>
            Git PR
            <select
              value={bindings().gitPrProfileId ?? ""}
              onInput={(event) =>
                setBindings({
                  ...bindings(),
                  gitPrProfileId:
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
          </label>
          <p>{profileSummary(bindings().gitPrProfileId, profiles())}</p>
          <label>
            AI Ask
            <select
              value={bindings().aiDefaultProfileId ?? ""}
              onInput={(event) =>
                setBindings({
                  ...bindings(),
                  aiDefaultProfileId:
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
          </label>
          <p>{profileSummary(bindings().aiDefaultProfileId, profiles())}</p>
          <button
            type="button"
            disabled={isSaving() || profiles().length === 0}
            onClick={() => void saveBindings()}
          >
            Save default profiles
          </button>
        </section>
        <section>
          <h3>Default prompt templates</h3>
          <label>
            Git Commit
            <select
              value={selectedCommitPromptTemplateId()}
              onInput={(event) =>
                setSelectedCommitPromptTemplateId(event.currentTarget.value)
              }
            >
              <For each={commitTemplates()}>
                {(template) => (
                  <option value={template.id}>{template.name}</option>
                )}
              </For>
            </select>
          </label>
          <label>
            Git PR
            <select
              value={selectedPrPromptTemplateId()}
              onInput={(event) =>
                setSelectedPrPromptTemplateId(event.currentTarget.value)
              }
            >
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
            onClick={() => void savePromptDefaults()}
          >
            Save prompt template defaults
          </button>
        </section>
        <section>
          <h3>Output language</h3>
          <label>
            Git Commit
            <input
              list="action-language-options"
              value={operationLanguages().gitCommitLanguage}
              onInput={(event) =>
                setOperationLanguages({
                  ...operationLanguages(),
                  gitCommitLanguage: event.currentTarget.value,
                })
              }
            />
          </label>
          <label>
            Git PR
            <input
              list="action-language-options"
              value={operationLanguages().gitPrLanguage}
              onInput={(event) =>
                setOperationLanguages({
                  ...operationLanguages(),
                  gitPrLanguage: event.currentTarget.value,
                })
              }
            />
          </label>
          <label>
            AI Session Purpose Summary
            <input
              list="action-language-options"
              value={operationLanguages().aiSessionPurposeLanguage}
              onInput={(event) =>
                setOperationLanguages({
                  ...operationLanguages(),
                  aiSessionPurposeLanguage: event.currentTarget.value,
                })
              }
            />
          </label>
          <datalist id="action-language-options">
            <For each={LANGUAGE_OPTIONS}>
              {(language) => <option value={language} />}
            </For>
          </datalist>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveLanguages()}
          >
            Save output languages
          </button>
        </section>
        <section>
          <h3>Action execution prompts</h3>
          <label>
            Git Commit prompt
            <p>{commitPromptPath()}</p>
            <textarea
              rows={8}
              value={commitPromptText()}
              onInput={(event) =>
                setCommitPromptText(event.currentTarget.value)
              }
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveActionPrompt("commit")}
          >
            Save commit execution prompt
          </button>
          <label>
            Git PR prompt
            <p>{prPromptPath()}</p>
            <textarea
              rows={8}
              value={prPromptText()}
              onInput={(event) => setPrPromptText(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveActionPrompt("create-pr")}
          >
            Save PR execution prompt
          </button>
          <label>
            AI Session Purpose prompt
            <p>{sessionPurposePromptPath()}</p>
            <textarea
              rows={8}
              value={sessionPurposePromptText()}
              onInput={(event) =>
                setSessionPurposePromptText(event.currentTarget.value)
              }
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveActionPrompt("ai-session-purpose")}
          >
            Save session-purpose prompt
          </button>
          <label>
            AI Session Refresh Purpose prompt
            <p>{sessionRefreshPurposePromptPath()}</p>
            <textarea
              rows={4}
              value={sessionRefreshPurposePromptText()}
              onInput={(event) =>
                setSessionRefreshPurposePromptText(event.currentTarget.value)
              }
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveActionPrompt("ai-session-refresh-purpose")}
          >
            Save refresh-purpose prompt
          </button>
          <label>
            AI Session Resume prompt
            <p>{sessionResumePromptPath()}</p>
            <textarea
              rows={3}
              value={sessionResumePromptText()}
              onInput={(event) =>
                setSessionResumePromptText(event.currentTarget.value)
              }
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void saveActionPrompt("ai-session-resume")}
          >
            Save resume-session prompt
          </button>
        </section>
      </Show>
    </section>
  );
}

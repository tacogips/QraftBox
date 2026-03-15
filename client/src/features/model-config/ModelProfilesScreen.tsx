import { createSignal, For, type JSX, onMount, Show } from "solid-js";
import { createModelConfigApiClient } from "../../../../client-shared/src/api/model-config";
import type {
  ModelAuthMode,
  ModelProfile,
  ModelVendor,
} from "../../../../src/types/model-config";
import { ScreenHeader } from "../../components/ScreenHeader";
import { parseArgumentLines, suggestModelId } from "./forms";

export interface ModelProfilesScreenProps {
  readonly apiBaseUrl: string;
}

const SCREEN_SHELL_CLASS =
  "mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6";
const PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-secondary p-5";
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-emphasis";
const ACTION_BUTTON_CLASS =
  "rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50";

function getVendorBadgeClass(vendor: ModelVendor): string {
  return vendor === "anthropics"
    ? "border-accent-emphasis/30 bg-accent-muted/15 text-accent-fg"
    : "border-success-emphasis/30 bg-success-muted/15 text-success-fg";
}

function getAuthModeLabel(authMode: ModelAuthMode): string {
  return authMode === "api_key" ? "API key env vars" : "CLI auth";
}

function renderProfileSummary(profile: ModelProfile): JSX.Element {
  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-text-primary">
              {profile.name}
            </h3>
            <span
              class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${getVendorBadgeClass(
                profile.vendor,
              )}`}
            >
              {profile.vendor}
            </span>
            <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {getAuthModeLabel(profile.authMode)}
            </span>
          </div>
          <p class="mt-2 break-all font-mono text-sm text-text-secondary">
            {profile.model}
          </p>
        </div>
      </div>

      <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3">
        <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
          Arguments
        </p>
        <p class="mt-2 break-words font-mono text-xs leading-6 text-text-secondary">
          {profile.arguments.length > 0 ? profile.arguments.join(" ") : "None"}
        </p>
      </div>
    </div>
  );
}

export function ModelProfilesScreen(
  props: ModelProfilesScreenProps,
): JSX.Element {
  const modelConfigApi = createModelConfigApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [isLoading, setIsLoading] = createSignal(true);
  const [isSaving, setIsSaving] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [profiles, setProfiles] = createSignal<readonly ModelProfile[]>([]);

  const [draftName, setDraftName] = createSignal("");
  const [draftVendor, setDraftVendor] = createSignal<ModelVendor>("anthropics");
  const [draftAuthMode, setDraftAuthMode] =
    createSignal<ModelAuthMode>("cli_auth");
  const [draftModel, setDraftModel] = createSignal("claude-opus-4-6");
  const [draftArgumentsText, setDraftArgumentsText] = createSignal(
    "--permission-mode\nbypassPermissions",
  );

  const [editingProfileId, setEditingProfileId] = createSignal<string | null>(
    null,
  );
  const [editName, setEditName] = createSignal("");
  const [editVendor, setEditVendor] = createSignal<ModelVendor>("anthropics");
  const [editAuthMode, setEditAuthMode] =
    createSignal<ModelAuthMode>("cli_auth");
  const [editModel, setEditModel] = createSignal("");
  const [editArgumentsText, setEditArgumentsText] = createSignal("");

  async function load(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const state = await modelConfigApi.fetchModelConfigState();
      setProfiles(state.profiles);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load model profiles",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function startEditing(profile: ModelProfile): void {
    setEditingProfileId(profile.id);
    setEditName(profile.name);
    setEditVendor(profile.vendor);
    setEditAuthMode(profile.authMode);
    setEditModel(profile.model);
    setEditArgumentsText(profile.arguments.join("\n"));
  }

  function cancelEditing(): void {
    setEditingProfileId(null);
    setEditName("");
    setEditVendor("anthropics");
    setEditAuthMode("cli_auth");
    setEditModel("");
    setEditArgumentsText("");
  }

  async function createProfile(): Promise<void> {
    if (draftName().trim().length === 0 || draftModel().trim().length === 0) {
      setErrorMessage("Name and model are required");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await modelConfigApi.createModelProfile({
        name: draftName().trim(),
        vendor: draftVendor(),
        authMode: draftAuthMode(),
        model: draftModel().trim(),
        arguments: parseArgumentLines(draftArgumentsText()),
      });
      setDraftName("");
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create profile",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit(profileId: string): Promise<void> {
    if (editName().trim().length === 0 || editModel().trim().length === 0) {
      setErrorMessage("Name and model are required");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await modelConfigApi.updateModelProfile(profileId, {
        name: editName().trim(),
        vendor: editVendor(),
        authMode: editAuthMode(),
        model: editModel().trim(),
        arguments: parseArgumentLines(editArgumentsText()),
      });
      cancelEditing();
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update profile",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeProfile(profileId: string): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await modelConfigApi.deleteModelProfile(profileId);
      if (editingProfileId() === profileId) {
        cancelEditing();
      }
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete profile",
      );
    } finally {
      setIsSaving(false);
    }
  }

  onMount(() => {
    void load();
  });

  return (
    <section class={SCREEN_SHELL_CLASS}>
      <ScreenHeader
        title="Model Profiles"
        subtitle="Register reusable model definitions for commit generation, PR creation, and AI session work. Profiles capture vendor, auth mode, model id, and CLI arguments."
      />

      <Show when={errorMessage() !== null}>
        <div class="rounded-2xl border border-danger-emphasis/40 bg-danger-muted/10 p-4 text-sm text-danger-fg">
          {errorMessage()}
        </div>
      </Show>

      <Show when={isLoading()}>
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-6 text-sm text-text-secondary">
          Loading model profiles...
        </div>
      </Show>

      <Show when={!isLoading()}>
        <div class="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.3fr)]">
          <section class={`${PANEL_CLASS} space-y-4`}>
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                Register profile
              </p>
              <h3 class="mt-1 text-lg font-semibold text-text-primary">
                Add a reusable runtime target
              </h3>
            </div>

            <label class="block text-sm">
              <span class="text-text-secondary">Name</span>
              <input
                class={FIELD_CLASS}
                value={draftName()}
                placeholder="e.g. Fast OpenAI"
                onInput={(event) => setDraftName(event.currentTarget.value)}
              />
            </label>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label class="block text-sm">
                <span class="text-text-secondary">Vendor</span>
                <select
                  class={FIELD_CLASS}
                  value={draftVendor()}
                  onInput={(event) => {
                    const vendor = event.currentTarget.value as ModelVendor;
                    setDraftVendor(vendor);
                    setDraftModel(suggestModelId(vendor));
                  }}
                >
                  <option value="anthropics">anthropics</option>
                  <option value="openai">openai</option>
                </select>
              </label>

              <label class="block text-sm">
                <span class="text-text-secondary">Authentication</span>
                <select
                  class={FIELD_CLASS}
                  value={draftAuthMode()}
                  onInput={(event) =>
                    setDraftAuthMode(event.currentTarget.value as ModelAuthMode)
                  }
                >
                  <option value="cli_auth">Use logged-in CLI auth</option>
                  <option value="api_key">Use API key env vars</option>
                </select>
              </label>
            </div>

            <label class="block text-sm">
              <span class="text-text-secondary">Model</span>
              <input
                class={FIELD_CLASS}
                value={draftModel()}
                placeholder="claude-opus-4-6 / gpt-5.3-codex"
                onInput={(event) => setDraftModel(event.currentTarget.value)}
              />
            </label>

            <label class="block text-sm">
              <span class="text-text-secondary">
                Arguments, one token per line
              </span>
              <textarea
                rows={6}
                class={`${FIELD_CLASS} resize-y font-mono`}
                value={draftArgumentsText()}
                onInput={(event) =>
                  setDraftArgumentsText(event.currentTarget.value)
                }
              />
            </label>

            <div class="rounded-xl border border-border-default bg-bg-primary/70 px-4 py-3 text-sm text-text-secondary">
              Suggested default for {draftVendor()}:{" "}
              <span class="font-mono text-text-primary">
                {suggestModelId(draftVendor())}
              </span>
            </div>

            <button
              type="button"
              disabled={isSaving()}
              class="rounded-md border border-success-emphasis/40 bg-success-muted/20 px-3 py-2 text-sm font-medium text-success-fg transition hover:bg-success-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void createProfile()}
            >
              {isSaving() ? "Saving..." : "Register profile"}
            </button>
          </section>

          <section class={`${PANEL_CLASS} min-h-0`}>
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                  Registered profiles
                </p>
                <h3 class="mt-1 text-lg font-semibold text-text-primary">
                  Available model targets
                </h3>
              </div>
              <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
                {profiles().length} profiles
              </span>
            </div>

            <Show
              when={profiles().length > 0}
              fallback={
                <div class="mt-6 rounded-2xl border border-dashed border-border-default bg-bg-primary/50 px-6 py-12 text-center text-sm text-text-secondary">
                  No profiles are registered yet.
                </div>
              }
            >
              <div class="mt-5 space-y-4 overflow-auto">
                <For each={profiles()}>
                  {(profile) => (
                    <article class="rounded-2xl border border-border-default bg-bg-primary/60 p-4">
                      <Show
                        when={editingProfileId() === profile.id}
                        fallback={
                          <>
                            {renderProfileSummary(profile)}
                            <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border-default/60 pt-4">
                              <button
                                type="button"
                                disabled={isSaving()}
                                class={ACTION_BUTTON_CLASS}
                                onClick={() => startEditing(profile)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isSaving()}
                                class="rounded-md border border-danger-emphasis/30 bg-danger-muted/10 px-3 py-2 text-sm font-medium text-danger-fg transition hover:bg-danger-muted/20 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => void removeProfile(profile.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        }
                      >
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label class="block text-sm">
                            <span class="text-text-secondary">Name</span>
                            <input
                              class={FIELD_CLASS}
                              value={editName()}
                              onInput={(event) =>
                                setEditName(event.currentTarget.value)
                              }
                            />
                          </label>

                          <label class="block text-sm">
                            <span class="text-text-secondary">Model</span>
                            <input
                              class={FIELD_CLASS}
                              value={editModel()}
                              onInput={(event) =>
                                setEditModel(event.currentTarget.value)
                              }
                            />
                          </label>
                        </div>

                        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label class="block text-sm">
                            <span class="text-text-secondary">Vendor</span>
                            <select
                              class={FIELD_CLASS}
                              value={editVendor()}
                              onInput={(event) => {
                                const vendor = event.currentTarget
                                  .value as ModelVendor;
                                setEditVendor(vendor);
                                if (editModel().trim().length === 0) {
                                  setEditModel(suggestModelId(vendor));
                                }
                              }}
                            >
                              <option value="anthropics">anthropics</option>
                              <option value="openai">openai</option>
                            </select>
                          </label>

                          <label class="block text-sm">
                            <span class="text-text-secondary">
                              Authentication
                            </span>
                            <select
                              class={FIELD_CLASS}
                              value={editAuthMode()}
                              onInput={(event) =>
                                setEditAuthMode(
                                  event.currentTarget.value as ModelAuthMode,
                                )
                              }
                            >
                              <option value="cli_auth">
                                Use logged-in CLI auth
                              </option>
                              <option value="api_key">
                                Use API key env vars
                              </option>
                            </select>
                          </label>
                        </div>

                        <label class="mt-3 block text-sm">
                          <span class="text-text-secondary">Arguments</span>
                          <textarea
                            rows={5}
                            class={`${FIELD_CLASS} resize-y font-mono`}
                            value={editArgumentsText()}
                            onInput={(event) =>
                              setEditArgumentsText(event.currentTarget.value)
                            }
                          />
                        </label>

                        <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border-default/60 pt-4">
                          <button
                            type="button"
                            disabled={isSaving()}
                            class="rounded-md border border-success-emphasis/40 bg-success-muted/20 px-3 py-2 text-sm font-medium text-success-fg transition hover:bg-success-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void saveEdit(profile.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={isSaving()}
                            class={ACTION_BUTTON_CLASS}
                            onClick={() => cancelEditing()}
                          >
                            Cancel
                          </button>
                        </div>
                      </Show>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>
      </Show>
    </section>
  );
}

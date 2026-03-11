import { createSignal, For, type JSX, onMount, Show } from "solid-js";
import { createModelConfigApiClient } from "../../../../client-shared/src/api/model-config";
import type {
  ModelAuthMode,
  ModelProfile,
  ModelVendor,
} from "../../../../src/types/model-config";
import { parseArgumentLines, suggestModelId } from "./forms";

export interface ModelProfilesScreenProps {
  readonly apiBaseUrl: string;
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
    <section>
      <h2>Model Profiles</h2>
      <p>Register and manage reusable model profiles for AI actions.</p>
      <Show when={errorMessage() !== null}>
        <p role="alert">{errorMessage()}</p>
      </Show>
      <Show when={isLoading()}>
        <p>Loading model profiles...</p>
      </Show>
      <Show when={!isLoading()}>
        <section>
          <h3>Register profile</h3>
          <label>
            Name
            <input
              value={draftName()}
              onInput={(event) => setDraftName(event.currentTarget.value)}
            />
          </label>
          <label>
            Vendor
            <select
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
          <label>
            Model
            <input
              value={draftModel()}
              onInput={(event) => setDraftModel(event.currentTarget.value)}
            />
          </label>
          <label>
            Authentication
            <select
              value={draftAuthMode()}
              onInput={(event) =>
                setDraftAuthMode(event.currentTarget.value as ModelAuthMode)
              }
            >
              <option value="cli_auth">Use logged-in CLI auth</option>
              <option value="api_key">Use API key env vars</option>
            </select>
          </label>
          <label>
            Arguments
            <textarea
              rows={4}
              value={draftArgumentsText()}
              onInput={(event) =>
                setDraftArgumentsText(event.currentTarget.value)
              }
            />
          </label>
          <button
            type="button"
            disabled={isSaving()}
            onClick={() => void createProfile()}
          >
            Register profile
          </button>
        </section>
        <section>
          <h3>Registered profiles</h3>
          <Show
            when={profiles().length > 0}
            fallback={<p>No profiles registered.</p>}
          >
            <For each={profiles()}>
              {(profile) => (
                <article>
                  <Show
                    when={editingProfileId() === profile.id}
                    fallback={
                      <>
                        <p>{profile.name}</p>
                        <p>
                          {profile.vendor} / {profile.model}
                        </p>
                        <p>
                          auth:{" "}
                          {profile.authMode === "api_key"
                            ? "API key env vars"
                            : "CLI authenticated session"}
                        </p>
                        <p>{profile.arguments.join(" ")}</p>
                        <button
                          type="button"
                          disabled={isSaving()}
                          onClick={() => startEditing(profile)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isSaving()}
                          onClick={() => void removeProfile(profile.id)}
                        >
                          Delete
                        </button>
                      </>
                    }
                  >
                    <label>
                      Name
                      <input
                        value={editName()}
                        onInput={(event) =>
                          setEditName(event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      Vendor
                      <select
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
                    <label>
                      Model
                      <input
                        value={editModel()}
                        onInput={(event) =>
                          setEditModel(event.currentTarget.value)
                        }
                      />
                    </label>
                    <label>
                      Authentication
                      <select
                        value={editAuthMode()}
                        onInput={(event) =>
                          setEditAuthMode(
                            event.currentTarget.value as ModelAuthMode,
                          )
                        }
                      >
                        <option value="cli_auth">Use logged-in CLI auth</option>
                        <option value="api_key">Use API key env vars</option>
                      </select>
                    </label>
                    <label>
                      Arguments
                      <textarea
                        rows={3}
                        value={editArgumentsText()}
                        onInput={(event) =>
                          setEditArgumentsText(event.currentTarget.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={isSaving()}
                      onClick={() => void saveEdit(profile.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={isSaving()}
                      onClick={() => cancelEditing()}
                    >
                      Cancel
                    </button>
                  </Show>
                </article>
              )}
            </For>
          </Show>
        </section>
      </Show>
    </section>
  );
}

<script lang="ts">
  import {
    createModelProfileApi,
    deleteModelProfileApi,
    fetchModelConfigState,
    updateModelProfileApi,
  } from "../../src/lib/app-api";
  import type {
    ModelConfigState,
    ModelProfile,
    ModelVendor,
  } from "../../../src/types/model-config";

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let profiles = $state<ModelProfile[]>([]);

  let draftName = $state("");
  let draftVendor = $state<ModelVendor>("anthropics");
  let draftModel = $state("claude-opus-4-6");
  let draftArgumentsText = $state("--permission-mode\nbypassPermissions");

  let editingProfileId = $state<string | null>(null);
  let editName = $state("");
  let editVendor = $state<ModelVendor>("anthropics");
  let editModel = $state("");
  let editArgumentsText = $state("");

  async function load(): Promise<void> {
    try {
      loading = true;
      error = null;
      const state = (await fetchModelConfigState()) as ModelConfigState;
      profiles = [...state.profiles];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load model profiles";
    } finally {
      loading = false;
    }
  }

  function parseArguments(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function suggestModel(vendor: ModelVendor, editing = false): void {
    const suggested =
      vendor === "anthropics" ? "claude-opus-4-6" : "gpt-5.3-codex";
    if (editing) {
      editVendor = vendor;
      if (editModel.trim().length === 0) {
        editModel = suggested;
      }
      return;
    }
    draftVendor = vendor;
    draftModel = suggested;
  }

  async function createProfile(): Promise<void> {
    const name = draftName.trim();
    const model = draftModel.trim();
    if (name.length === 0 || model.length === 0) {
      error = "Name and model are required";
      return;
    }

    try {
      saving = true;
      error = null;
      await createModelProfileApi({
        name,
        vendor: draftVendor,
        model,
        arguments: parseArguments(draftArgumentsText),
      });

      draftName = "";
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create profile";
    } finally {
      saving = false;
    }
  }

  function startEditing(profile: ModelProfile): void {
    editingProfileId = profile.id;
    editName = profile.name;
    editVendor = profile.vendor;
    editModel = profile.model;
    editArgumentsText = profile.arguments.join("\n");
  }

  function cancelEditing(): void {
    editingProfileId = null;
    editName = "";
    editVendor = "anthropics";
    editModel = "";
    editArgumentsText = "";
  }

  async function saveEdit(profileId: string): Promise<void> {
    const name = editName.trim();
    const model = editModel.trim();
    if (name.length === 0 || model.length === 0) {
      error = "Name and model are required";
      return;
    }

    try {
      saving = true;
      error = null;
      await updateModelProfileApi(profileId, {
        name,
        vendor: editVendor,
        model,
        arguments: parseArguments(editArgumentsText),
      });
      cancelEditing();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update profile";
    } finally {
      saving = false;
    }
  }

  async function removeProfile(profileId: string): Promise<void> {
    try {
      saving = true;
      error = null;
      await deleteModelProfileApi(profileId);
      if (editingProfileId === profileId) {
        cancelEditing();
      }
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete profile";
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<div
  class="h-full flex flex-col bg-bg-primary"
  role="main"
  aria-label="Model profiles"
>
  <div class="px-4 py-3 border-b border-border-default bg-bg-secondary">
    <h2 class="text-lg font-semibold text-text-primary">Model Profiles</h2>
    <p class="text-xs text-text-secondary mt-1">
      Register and manage reusable model profiles.
    </p>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
    {#if loading}
      <p class="text-sm text-text-secondary">Loading model profiles...</p>
    {:else}
      {#if error !== null}
        <div
          class="rounded border border-danger-emphasis bg-danger-subtle text-danger-fg px-3 py-2 text-sm"
        >
          {error}
        </div>
      {/if}

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3"
      >
        <h3 class="text-sm font-semibold text-text-primary">
          Register Profile
        </h3>

        <label class="block text-sm">
          <span class="text-text-secondary">Name</span>
          <input
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={draftName}
            placeholder="e.g. Fast OpenAI"
          />
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Vendor</span>
          <select
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={draftVendor}
            onchange={(e) =>
              suggestModel(
                (e.currentTarget as HTMLSelectElement).value as ModelVendor,
              )}
          >
            <option value="anthropics">anthropics</option>
            <option value="openai">openai</option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Model</span>
          <input
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={draftModel}
            placeholder="claude-opus-4-6 / gpt-5.3-codex"
          />
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Arguments (one token per line)</span
          >
          <textarea
            rows="4"
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm font-mono"
            bind:value={draftArgumentsText}
            placeholder="--permission-mode&#10;bypassPermissions"
          ></textarea>
        </label>

        <button
          type="button"
          class="px-3 py-1.5 rounded bg-success-emphasis text-white text-sm disabled:opacity-50"
          disabled={saving}
          onclick={() => void createProfile()}
        >
          Register profile
        </button>
      </section>

      <section
        class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-2"
      >
        <h3 class="text-sm font-semibold text-text-primary">
          Registered Profiles
        </h3>
        {#if profiles.length === 0}
          <p class="text-sm text-text-secondary">No profiles registered.</p>
        {:else}
          {#each profiles as profile (profile.id)}
            <div
              class="rounded border border-border-default bg-bg-primary px-3 py-3 space-y-2"
            >
              {#if editingProfileId === profile.id}
                <label class="block text-sm">
                  <span class="text-text-secondary">Name</span>
                  <input
                    class="mt-1 w-full rounded border border-border-default bg-bg-secondary px-2 py-1.5 text-sm"
                    bind:value={editName}
                  />
                </label>

                <label class="block text-sm">
                  <span class="text-text-secondary">Vendor</span>
                  <select
                    class="mt-1 w-full rounded border border-border-default bg-bg-secondary px-2 py-1.5 text-sm"
                    bind:value={editVendor}
                    onchange={(e) =>
                      suggestModel(
                        (e.currentTarget as HTMLSelectElement)
                          .value as ModelVendor,
                        true,
                      )}
                  >
                    <option value="anthropics">anthropics</option>
                    <option value="openai">openai</option>
                  </select>
                </label>

                <label class="block text-sm">
                  <span class="text-text-secondary">Model</span>
                  <input
                    class="mt-1 w-full rounded border border-border-default bg-bg-secondary px-2 py-1.5 text-sm"
                    bind:value={editModel}
                  />
                </label>

                <label class="block text-sm">
                  <span class="text-text-secondary">Arguments</span>
                  <textarea
                    rows="3"
                    class="mt-1 w-full rounded border border-border-default bg-bg-secondary px-2 py-1.5 text-sm font-mono"
                    bind:value={editArgumentsText}
                  ></textarea>
                </label>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded text-xs bg-accent-emphasis text-white disabled:opacity-50"
                    disabled={saving}
                    onclick={() => void saveEdit(profile.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded text-xs bg-bg-tertiary text-text-secondary disabled:opacity-50"
                    disabled={saving}
                    onclick={cancelEditing}
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-medium text-text-primary">
                      {profile.name}
                    </p>
                    <p class="text-xs text-text-secondary">
                      {profile.vendor} / {profile.model}
                    </p>
                    <p class="text-xs text-text-tertiary font-mono break-all">
                      {profile.arguments.join(" ")}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="px-2 py-1 rounded text-xs bg-bg-tertiary text-text-secondary disabled:opacity-50"
                      disabled={saving}
                      onclick={() => startEditing(profile)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 rounded text-xs bg-danger-subtle text-danger-fg disabled:opacity-50"
                      disabled={saving}
                      onclick={() => void removeProfile(profile.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {/if}
  </div>
</div>

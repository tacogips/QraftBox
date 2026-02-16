<script lang="ts">
  import {
    createModelProfileApi,
    deleteModelProfileApi,
    fetchModelConfigState,
    updateModelBindingsApi,
  } from "../../src/lib/app-api";
  import type {
    ModelConfigState,
    ModelProfile,
    ModelVendor,
    OperationModelBindings,
  } from "../../../src/types/model-config";

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let profiles = $state<ModelProfile[]>([]);
  let bindings = $state<OperationModelBindings>({
    gitCommitProfileId: null,
    gitPrProfileId: null,
    aiDefaultProfileId: null,
  });

  let draftName = $state("");
  let draftVendor = $state<ModelVendor>("anthropics");
  let draftModel = $state("claude-opus-4-6");
  let draftArgumentsText = $state("--permission-mode\nbypassPermissions");

  async function load(): Promise<void> {
    try {
      loading = true;
      error = null;
      const state = (await fetchModelConfigState()) as ModelConfigState;
      profiles = [...state.profiles];
      bindings = state.operationBindings;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load model config";
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

  function suggestModel(vendor: ModelVendor): void {
    draftVendor = vendor;
    draftModel = vendor === "anthropics" ? "claude-opus-4-6" : "codex5.3";
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

  async function removeProfile(profileId: string): Promise<void> {
    try {
      saving = true;
      error = null;
      await deleteModelProfileApi(profileId);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete profile";
    } finally {
      saving = false;
    }
  }

  async function saveBindings(): Promise<void> {
    try {
      saving = true;
      error = null;
      bindings = await updateModelBindingsApi(bindings);
      await load();
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to update operation mappings";
    } finally {
      saving = false;
    }
  }

  function profileLabel(profile: ModelProfile): string {
    return `${profile.name} (${profile.vendor} / ${profile.model})`;
  }

  $effect(() => {
    void load();
  });
</script>

<div class="h-full flex flex-col bg-bg-primary" role="main" aria-label="Model config">
  <div class="px-4 py-3 border-b border-border-default bg-bg-secondary">
    <h2 class="text-lg font-semibold text-text-primary">Model Config</h2>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
    {#if loading}
      <p class="text-sm text-text-secondary">Loading model config...</p>
    {:else}
      {#if error !== null}
        <div class="rounded border border-danger-emphasis bg-danger-subtle text-danger-fg px-3 py-2 text-sm">
          {error}
        </div>
      {/if}

      <section class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3">
        <h3 class="text-sm font-semibold text-text-primary">Operation Mappings</h3>

        <label class="block text-sm">
          <span class="text-text-secondary">Git Commit</span>
          <select
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.gitCommitProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileLabel(profile)}</option>
            {/each}
          </select>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Git PR (create/update)</span>
          <select
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.gitPrProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileLabel(profile)}</option>
            {/each}
          </select>
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">AI Ask default</span>
          <select
            class="mt-1 w-full rounded border border-border-default bg-bg-primary px-2 py-1.5 text-sm"
            bind:value={bindings.aiDefaultProfileId}
          >
            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profileLabel(profile)}</option>
            {/each}
          </select>
        </label>

        <button
          type="button"
          class="px-3 py-1.5 rounded bg-accent-emphasis text-white text-sm disabled:opacity-50"
          disabled={saving || profiles.length === 0}
          onclick={() => void saveBindings()}
        >
          Save operation mappings
        </button>
      </section>

      <section class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-3">
        <h3 class="text-sm font-semibold text-text-primary">Add Profile</h3>

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
              suggestModel((e.currentTarget as HTMLSelectElement).value as ModelVendor)}
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
            placeholder="claude-opus-4-6 / codex5.3"
          />
        </label>

        <label class="block text-sm">
          <span class="text-text-secondary">Arguments (one token per line)</span>
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

      <section class="rounded-lg border border-border-default bg-bg-secondary p-4 space-y-2">
        <h3 class="text-sm font-semibold text-text-primary">Registered Profiles</h3>
        {#if profiles.length === 0}
          <p class="text-sm text-text-secondary">No profiles registered.</p>
        {:else}
          {#each profiles as profile (profile.id)}
            <div class="rounded border border-border-default bg-bg-primary px-3 py-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-medium text-text-primary">{profile.name}</p>
                  <p class="text-xs text-text-secondary">
                    {profile.vendor} / {profile.model}
                  </p>
                  <p class="text-xs text-text-tertiary font-mono break-all">
                    {profile.arguments.join(" ")}
                  </p>
                </div>
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
          {/each}
        {/if}
      </section>
    {/if}
  </div>
</div>

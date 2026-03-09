<script lang="ts">
  /**
   * PromptSelector Component
   *
   * Dropdown selector for commit prompt templates.
   *
   * Features:
   * - Touch-friendly dropdown with 52px minimum height
   * - Template name and description display
   * - Visual indication of selected template
   * - Keyboard navigation support
   *
   * Props:
   * - templates: Available prompt templates
   * - selectedId: Currently selected template ID
   * - onSelect: Callback when template is selected
   */

  import type { PromptTemplate } from "../stores/commit";

  interface Props {
    templates: readonly PromptTemplate[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  }

  const { templates, selectedId, onSelect }: Props = $props();

  /**
   * Whether dropdown is open
   */
  let isOpen = $state<boolean>(false);

  /**
   * Get currently selected template
   */
  function getSelectedTemplate(): PromptTemplate | null {
    if (selectedId === null) {
      return null;
    }
    const found = templates.find((t) => t.id === selectedId);
    return found ?? null;
  }

  /**
   * Toggle dropdown open/close
   */
  function toggleDropdown(): void {
    isOpen = !isOpen;
  }

  /**
   * Handle template selection
   */
  function handleSelect(templateId: string): void {
    onSelect(templateId);
    isOpen = false;
  }

  /**
   * Close dropdown when clicking outside
   */
  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest(".prompt-selector-dropdown")) {
      isOpen = false;
    }
  }

  /**
   * Handle keyboard navigation
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      isOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="prompt-selector-dropdown relative">
  <!-- Selector Button -->
  <button
    type="button"
    onclick={toggleDropdown}
    class="selector-button w-full px-4 py-3 min-h-[52px]
           flex items-center justify-between gap-3
           text-left
           bg-bg-tertiary border border-border-default rounded-lg
           hover:bg-bg-hover hover:border-accent-emphasis
           focus:outline-none focus:ring-2 focus:ring-accent-emphasis
           transition-colors"
    aria-expanded={isOpen}
    aria-haspopup="listbox"
  >
    <div class="flex-1 min-w-0">
      {#if getSelectedTemplate() !== null}
        {@const template = getSelectedTemplate()}
        {#if template !== null}
          <div class="template-name text-sm font-medium text-text-primary">
            {template.name}
          </div>
          <div class="template-description text-xs text-text-tertiary truncate">
            {template.description}
          </div>
        {/if}
      {:else}
        <div class="placeholder text-sm text-text-tertiary">
          Select a commit template
        </div>
      {/if}
    </div>

    <!-- Dropdown Arrow -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="flex-shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  <!-- Dropdown Menu -->
  {#if isOpen}
    <div
      class="dropdown-menu absolute top-full left-0 right-0 mt-2 z-10
             bg-bg-primary border border-border-default rounded-lg
             shadow-xl
             max-h-[300px] overflow-y-auto"
      role="listbox"
    >
      {#each templates as template (template.id)}
        <button
          type="button"
          onclick={() => handleSelect(template.id)}
          class="template-option w-full px-4 py-3 text-left
                 flex items-start gap-3
                 hover:bg-bg-hover
                 border-b border-border-default last:border-b-0
                 focus:outline-none focus:bg-bg-hover
                 transition-colors
                 {selectedId === template.id ? 'bg-accent-subtle' : ''}"
          role="option"
          aria-selected={selectedId === template.id}
        >
          <!-- Selection Indicator -->
          <div class="flex-shrink-0 pt-0.5">
            {#if selectedId === template.id}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-accent-fg"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {:else}
              <div class="w-[18px] h-[18px]"></div>
            {/if}
          </div>

          <!-- Template Info -->
          <div class="flex-1 min-w-0">
            <div
              class="template-name text-sm font-medium
                     {selectedId === template.id
                ? 'text-accent-fg'
                : 'text-text-primary'}"
            >
              {template.name}
            </div>
            <div class="template-description text-xs text-text-tertiary mt-1">
              {template.description}
            </div>
            {#if template.variables.length > 0}
              <div class="template-variables text-xs text-text-tertiary mt-1">
                Variables: {template.variables.join(", ")}
              </div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /**
 * PromptSelector Styling
 *
 * - Touch-friendly dropdown
 * - Smooth animations
 * - Selected state highlighting
 */
  .dropdown-menu {
    animation: dropdown-slide 0.15s ease-out;
    -webkit-overflow-scrolling: touch;
  }

  @keyframes dropdown-slide {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .selector-button,
  .template-option {
    -webkit-tap-highlight-color: transparent;
  }
</style>

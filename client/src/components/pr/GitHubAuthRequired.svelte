<script lang="ts">
  /**
   * GitHubAuthRequired Component
   *
   * Message component displayed when GitHub authentication is required.
   *
   * Features:
   * - Clear authentication instructions
   * - Touch-friendly authenticate button
   * - Warning icon and styling
   *
   * Props:
   * - onAuthenticate: Callback when authenticate button is clicked
   */

  interface Props {
    onAuthenticate: () => void;
  }

  const { onAuthenticate }: Props = $props();

  /**
   * Handle authenticate button click
   */
  function handleAuthenticate(): void {
    onAuthenticate();
  }

  /**
   * Handle Enter/Space key press on authenticate button
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onAuthenticate();
    }
  }
</script>

<div
  class="github-auth-required p-6 bg-amber-50 border border-amber-300 rounded-lg"
>
  <div class="flex flex-col items-center gap-4">
    <!-- Warning Icon -->
    <div class="warning-icon-container">
      <svg
        class="w-16 h-16 text-amber-600"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
    </div>

    <!-- Auth Required Message -->
    <div class="text-center">
      <h2 class="text-xl font-bold text-gray-900 mb-2">
        GitHub Authentication Required
      </h2>
      <p class="text-base text-gray-700 mb-4">
        To create pull requests, you need to authenticate with GitHub.
      </p>
      <p class="text-sm text-gray-600">
        You will be redirected to GitHub to authorize qraftbox.
      </p>
    </div>

    <!-- Authenticate Button -->
    <button
      type="button"
      onclick={handleAuthenticate}
      onkeydown={handleKeydown}
      class="authenticate-button min-h-[44px] px-8 py-3
             text-white bg-purple-600
             rounded-lg
             flex items-center gap-3
             hover:bg-purple-700
             focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
             active:bg-purple-800
             transition-colors
             font-medium text-base"
      aria-label="Authenticate with GitHub"
    >
      <svg
        class="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
        />
      </svg>
      <span>Authenticate with GitHub</span>
    </button>

    <!-- Security Note -->
    <p class="text-xs text-gray-500 text-center max-w-md">
      We will only request permissions necessary for creating and managing pull
      requests. You can revoke access at any time in your GitHub settings.
    </p>
  </div>
</div>

<style>
  /**
   * GitHubAuthRequired Styling
   *
   * - Warning-style message box
   * - Centered layout
   * - Touch-friendly authenticate button
   */
  .github-auth-required {
    animation: fade-in 0.3s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .warning-icon-container {
    animation: icon-pulse 0.5s ease-out;
  }

  @keyframes icon-pulse {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .authenticate-button:active {
    transform: scale(0.98);
  }
</style>

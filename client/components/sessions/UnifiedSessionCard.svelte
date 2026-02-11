<script lang="ts">
  /**
   * UnifiedSessionCard Component
   *
   * Wrapper component that adds a source badge and delegates rendering
   * to the appropriate underlying SessionCard component based on the
   * UnifiedSessionItem kind.
   *
   * Props:
   * - item: UnifiedSessionItem - the session item to render
   * - onResumeSession: Callback for resuming claude-cli sessions
   * - onSelectSession: Callback for selecting a session for detail view
   */

  import type { UnifiedSessionItem } from "../../src/types/unified-session";
  import ClaudeSessionCard from "../claude-sessions/SessionCard.svelte";
  import QraftBoxSessionCard from "../session/SessionCard.svelte";

  interface Props {
    item: UnifiedSessionItem;
    onResumeSession?: ((qraftAiSessionId: string) => void) | undefined;
    onSelectSession?: ((sessionId: string) => void) | undefined;
  }

  const {
    item,
    onResumeSession = undefined,
    onSelectSession = undefined,
  }: Props = $props();

  function handleQraftBoxSelect(): void {
    if (item.kind === "qraftbox" && onSelectSession !== undefined) {
      onSelectSession(item.session.id);
    }
  }

  function handleClaudeResume(qraftAiSessionId: string): void {
    if (onResumeSession !== undefined) {
      onResumeSession(qraftAiSessionId);
    }
  }

  function handleClaudeView(sessionId: string): void {
    if (onSelectSession !== undefined) {
      onSelectSession(sessionId);
    }
  }
</script>

<div class="unified-session-card">
  <!-- Source Badge -->
  {#if item.kind === "qraftbox"}
    <div class="flex items-center gap-2 mb-1 px-1">
      <span
        class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold
               bg-accent-muted text-accent-fg border border-accent-emphasis/30"
        aria-label="Session source: QraftBox"
      >
        QraftBox
      </span>
    </div>
    <QraftBoxSessionCard
      session={item.session}
      variant="completed"
      onSelect={handleQraftBoxSelect}
    />
  {:else}
    <div class="flex items-center gap-2 mb-1 px-1">
      <span
        class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold
               bg-bg-tertiary text-text-secondary border border-border-default"
        aria-label="Session source: Claude CLI"
      >
        CLI
      </span>
    </div>
    <ClaudeSessionCard
      session={item.session}
      onResume={handleClaudeResume}
      onView={handleClaudeView}
    />
  {/if}
</div>

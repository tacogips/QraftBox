/**
 * Strip system command XML tags from session transcript text.
 *
 * Claude Code injects metadata tags such as <local-command-caveat>,
 * <command-name>, <local-command-stdout>, <command-message>,
 * <command-args>, and <system-reminder> into user messages.
 * These are internal system metadata and should not be displayed
 * to users or included in search indices.
 */

const REMOVE_WITH_CONTENT_PATTERN =
  /<(local-command-caveat|command-name|local-command-stdout|command-message|command-args|system-reminder|qraftbox-internal-prompt)[^>]*>[\s\S]*?<\/\1>/g;
const UNWRAP_ONLY_PATTERN = /<\/?qraftbox-system-prompt[^>]*>/g;
const INTERNAL_PROMPT_PATTERN = /<qraftbox-internal-prompt\b[^>]*>/i;

export type QraftboxInternalPromptLabel =
  | "ai-session-purpose"
  | "ai-session-refresh-purpose"
  | "ai-session-resume";

/**
 * Remove system command XML tags and their content from text.
 * Cleans up excess whitespace left after tag removal.
 */
export function stripSystemTags(text: string): string {
  const withoutSystemBlocks = text.replace(REMOVE_WITH_CONTENT_PATTERN, "");
  const unwrapped = withoutSystemBlocks.replace(UNWRAP_ONLY_PATTERN, "");
  return unwrapped.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Check if text contains an internal QraftBox prompt marker.
 */
export function hasQraftboxInternalPrompt(text: string): boolean {
  return INTERNAL_PROMPT_PATTERN.test(text);
}

/**
 * Wrap text with qraftbox-internal-prompt marker so it can be hidden from
 * transcript displays while still being sent to the agent.
 */
export function wrapQraftboxInternalPrompt(
  label: QraftboxInternalPromptLabel,
  content: string,
  anchor = "session-internal-v1",
): string {
  const normalizedContent = content.trim();
  return `<qraftbox-internal-prompt label="${label}" anchor="${anchor}">
${normalizedContent}
</qraftbox-internal-prompt>`;
}

/**
 * Detect Codex bootstrap prompts that are injected as "user" messages
 * in session transcripts.
 */
export function isInjectedSessionSystemPrompt(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized.startsWith("# AGENTS.md instructions") ||
    normalized.startsWith("<environment_context>") ||
    normalized.startsWith("<turn_aborted>") ||
    normalized.includes("## Rule of the Responses") ||
    normalized.includes("## Autonomous Operation Policy")
  );
}

/**
 * Strip system command XML tags from session transcript text.
 *
 * Claude Code injects metadata tags such as <local-command-caveat>,
 * <command-name>, <local-command-stdout>, <command-message>,
 * <command-args>, and <system-reminder> into user messages.
 * These are internal system metadata and should not be displayed
 * to users or included in search indices.
 */

const SYSTEM_TAG_PATTERN =
  /<(local-command-caveat|command-name|local-command-stdout|command-message|command-args|system-reminder)[^>]*>[\s\S]*?<\/\1>/g;

/**
 * Remove system command XML tags and their content from text.
 * Cleans up excess whitespace left after tag removal.
 */
export function stripSystemTags(text: string): string {
  const stripped = text.replace(SYSTEM_TAG_PATTERN, "");
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

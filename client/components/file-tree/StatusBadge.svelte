<script lang="ts">
/**
 * StatusBadge component properties
 */
interface Props {
  /**
   * File status (undefined means no badge)
   */
  status: "added" | "modified" | "deleted" | undefined;
}

const { status }: Props = $props();

/**
 * Get badge text for status
 */
function getBadgeText(
  status: "added" | "modified" | "deleted" | undefined,
): string {
  if (status === undefined) {
    return "";
  }

  switch (status) {
    case "added":
      return "+";
    case "modified":
      return "M";
    case "deleted":
      return "-";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  }
}

/**
 * Get badge background color class for status
 */
function getBadgeBackgroundClass(
  status: "added" | "modified" | "deleted" | undefined,
): string {
  if (status === undefined) {
    return "";
  }

  switch (status) {
    case "added":
      return "bg-success-subtle";
    case "modified":
      return "bg-attention-muted";
    case "deleted":
      return "bg-danger-subtle";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  }
}

/**
 * Get badge text color class for status
 */
function getBadgeTextClass(
  status: "added" | "modified" | "deleted" | undefined,
): string {
  if (status === undefined) {
    return "";
  }

  switch (status) {
    case "added":
      return "text-success-fg";
    case "modified":
      return "text-attention-fg";
    case "deleted":
      return "text-danger-fg";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  }
}
</script>

<!-- Render badge only if status is defined -->
{#if status !== undefined}
  <span
    class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 min-w-[24px] {getBadgeBackgroundClass(
      status,
    )} {getBadgeTextClass(status)}"
    aria-label="{status} file"
  >
    {getBadgeText(status)}
  </span>
{/if}

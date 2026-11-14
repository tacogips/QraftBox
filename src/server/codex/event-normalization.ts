const CAMEL_OR_PASCAL_SEGMENT_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_IDENTIFIER_SEPARATOR_PATTERN = /[\s-]+/g;

export const CODEX_SESSION_ID_KEYS = [
  "thread_id",
  "threadId",
  "session_id",
  "sessionId",
] as const;

export const CODEX_THREAD_ID_KEYS = ["id", "thread_id", "threadId"] as const;

export const CODEX_TOOL_NAME_KEYS = ["tool_name", "toolName", "name"] as const;

export const CODEX_MESSAGE_TEXT_KEYS = ["text", "content", "message"] as const;

export function asCodexRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function readCodexStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readFirstCodexStringField(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = readCodexStringField(obj, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function normalizeCodexType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed
    .replace(CAMEL_OR_PASCAL_SEGMENT_PATTERN, "$1_$2")
    .replace(NON_IDENTIFIER_SEPARATOR_PATTERN, "_")
    .toLowerCase();
}

export function isCodexType(value: unknown, canonicalType: string): boolean {
  return normalizeCodexType(value) === canonicalType;
}

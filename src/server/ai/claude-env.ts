import type { ModelAuthMode, ModelVendor } from "../../types/model-config.js";

const CLAUDE_API_KEY_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;

const CODEX_API_KEY_ENV_KEYS = ["OPENAI_API_KEY", "CODEX_API_KEY"] as const;

/**
 * Build environment overrides for agent subprocess execution.
 *
 * - `api_key`: pass through inherited env (no overrides)
 * - `cli_auth`: mask key env vars so logged-in CLI auth is used
 */
export function buildAgentAuthEnv(
  vendor: ModelVendor,
  authMode: ModelAuthMode | undefined,
): Record<string, string> {
  if (authMode === "api_key") {
    return {};
  }

  const keys =
    vendor === "openai" ? CODEX_API_KEY_ENV_KEYS : CLAUDE_API_KEY_ENV_KEYS;
  const overrides: Record<string, string> = {};
  for (const key of keys) {
    overrides[key] = "";
  }
  return overrides;
}

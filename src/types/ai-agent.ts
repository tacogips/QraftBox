/**
 * Supported AI agents for QraftBox execution/runtime routing.
 */
import type { ModelVendor } from "./model-config";

export enum AIAgent {
  CLAUDE = "claude",
  CODEX = "codex",
  GEMINI = "gemini",
}

export function isAIAgent(value: unknown): value is AIAgent {
  return (
    value === AIAgent.CLAUDE ||
    value === AIAgent.CODEX ||
    value === AIAgent.GEMINI
  );
}

export function resolveAIAgentFromVendor(
  vendor: ModelVendor | undefined,
): AIAgent {
  return vendor === "openai" ? AIAgent.CODEX : AIAgent.CLAUDE;
}

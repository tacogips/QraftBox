/**
 * Supported AI agents for QraftBox execution/runtime routing.
 */
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

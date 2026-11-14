export type EmbeddedAiChatPaneMode = "collapsed" | "docked" | "expanded";

export function resolveEmbeddedAiChatPaneModeOnSessionOpen(
  currentMode: EmbeddedAiChatPaneMode,
): EmbeddedAiChatPaneMode {
  return currentMode === "collapsed" ? "docked" : currentMode;
}

export function canSubmitEmbeddedAiChatPrompt(params: {
  readonly projectPath: string;
  readonly promptInput: string;
  readonly submitting: boolean;
  readonly modelProfilesLoading: boolean;
}): boolean {
  return (
    params.projectPath.trim().length > 0 &&
    params.promptInput.trim().length > 0 &&
    !params.submitting &&
    !params.modelProfilesLoading
  );
}

export function resolveEmbeddedAiChatPaneLayoutClass(params: {
  readonly mode: EmbeddedAiChatPaneMode;
  readonly isPhoneViewport: boolean;
}): string {
  if (params.isPhoneViewport) {
    return "grid-cols-1";
  }

  if (params.mode === "collapsed") {
    return "xl:grid-cols-[minmax(0,1fr)_56px]";
  }

  return params.mode === "expanded"
    ? "xl:grid-cols-[minmax(0,0.82fr)_minmax(26rem,1.18fr)]"
    : "xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]";
}

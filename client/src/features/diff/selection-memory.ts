export interface DiffSelectionMemoryInput {
  readonly activeContextId: string;
  readonly loadedContextId: string | null;
  readonly currentSelectedPath: string | null;
  readonly rememberedSelections: Readonly<Record<string, string>>;
}

export function resolveRememberedDiffSelection(
  input: DiffSelectionMemoryInput,
): string | null {
  if (input.loadedContextId === input.activeContextId) {
    return input.currentSelectedPath;
  }

  return input.rememberedSelections[input.activeContextId] ?? null;
}

export function rememberDiffSelection(
  rememberedSelections: Readonly<Record<string, string>>,
  contextId: string,
  selectedPath: string,
): Record<string, string> {
  if (rememberedSelections[contextId] === selectedPath) {
    return { ...rememberedSelections };
  }

  return {
    ...rememberedSelections,
    [contextId]: selectedPath,
  };
}

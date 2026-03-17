import {
  generateQraftAiSessionId,
  type QraftAiSessionId,
} from "../../../../src/types/ai";

export const MAX_CHAT_COLUMNS = 20;

export interface ChatColumnState {
  readonly id: string;
  readonly selectedQraftAiSessionId: QraftAiSessionId | null;
  readonly draftSessionId: QraftAiSessionId;
}

export function createChatColumnId(): string {
  return `chat-column-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createChatColumnState(
  selectedQraftAiSessionId: QraftAiSessionId | null = null,
): ChatColumnState {
  return {
    id: createChatColumnId(),
    selectedQraftAiSessionId,
    draftSessionId: generateQraftAiSessionId(),
  };
}

export function appendChatColumn(
  columns: readonly ChatColumnState[],
  selectedQraftAiSessionId: QraftAiSessionId | null = null,
): readonly ChatColumnState[] {
  if (columns.length >= MAX_CHAT_COLUMNS) {
    return columns;
  }

  return [...columns, createChatColumnState(selectedQraftAiSessionId)];
}

export function replaceChatColumn(
  columns: readonly ChatColumnState[],
  nextColumn: ChatColumnState,
): readonly ChatColumnState[] {
  return columns.map((column) =>
    column.id === nextColumn.id ? nextColumn : column,
  );
}

export function createResetChatColumnState(
  column: ChatColumnState,
): ChatColumnState {
  return {
    ...column,
    selectedQraftAiSessionId: null,
    draftSessionId: generateQraftAiSessionId(),
  };
}

export function removeChatColumn(
  columns: readonly ChatColumnState[],
  columnId: string,
): readonly ChatColumnState[] {
  const remainingColumns = columns.filter((column) => column.id !== columnId);
  return remainingColumns.length > 0
    ? remainingColumns
    : [createChatColumnState()];
}

export function findChatColumnBySessionId(
  columns: readonly ChatColumnState[],
  sessionId: QraftAiSessionId,
): ChatColumnState | null {
  return (
    columns.find((column) => column.selectedQraftAiSessionId === sessionId) ??
    null
  );
}

export function resolveChatSelectionTargetColumnId(params: {
  readonly columns: readonly ChatColumnState[];
  readonly focusedColumnId: string | null;
  readonly sessionId: QraftAiSessionId;
}): string | null {
  const existingColumn = findChatColumnBySessionId(
    params.columns,
    params.sessionId,
  );
  if (existingColumn !== null) {
    return existingColumn.id;
  }

  if (
    params.focusedColumnId !== null &&
    params.columns.some((column) => column.id === params.focusedColumnId)
  ) {
    return params.focusedColumnId;
  }

  const firstDraftColumn = params.columns.find(
    (column) => column.selectedQraftAiSessionId === null,
  );
  if (firstDraftColumn !== undefined) {
    return firstDraftColumn.id;
  }

  const lastColumn = params.columns.at(-1);
  return lastColumn?.id ?? null;
}

export function assignSessionToChatColumn(params: {
  readonly columns: readonly ChatColumnState[];
  readonly columnId: string;
  readonly sessionId: QraftAiSessionId;
}): readonly ChatColumnState[] {
  return params.columns.map((column) =>
    column.id === params.columnId
      ? {
          ...column,
          selectedQraftAiSessionId: params.sessionId,
        }
      : column,
  );
}

export function resolveFocusedChatColumnIdAfterRemoval(params: {
  readonly columns: readonly ChatColumnState[];
  readonly removedColumnId: string;
  readonly focusedColumnId: string | null;
}): string | null {
  if (
    params.focusedColumnId === null ||
    params.focusedColumnId !== params.removedColumnId
  ) {
    return params.focusedColumnId;
  }

  const remainingColumns = params.columns.filter(
    (column) => column.id !== params.removedColumnId,
  );
  const fallbackColumn = remainingColumns.at(-1);
  return fallbackColumn?.id ?? null;
}

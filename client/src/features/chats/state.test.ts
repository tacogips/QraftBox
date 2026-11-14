import { describe, expect, test } from "bun:test";
import type { QraftAiSessionId } from "../../../../src/types/ai";
import {
  appendChatColumn,
  assignSessionToChatColumn,
  createChatColumnState,
  createResetChatColumnState,
  findChatColumnBySessionId,
  MAX_CHAT_COLUMNS,
  removeChatColumn,
  resolveChatSelectionTargetColumnId,
  resolveFocusedChatColumnIdAfterRemoval,
} from "./state";

function asQraftAiSessionId(value: string): QraftAiSessionId {
  return value as QraftAiSessionId;
}

describe("chats state helpers", () => {
  test("caps the number of chat columns", () => {
    let columns: readonly ReturnType<typeof createChatColumnState>[] = [
      createChatColumnState(),
    ];

    while (columns.length < MAX_CHAT_COLUMNS) {
      columns = appendChatColumn(columns);
    }

    expect(appendChatColumn(columns)).toHaveLength(MAX_CHAT_COLUMNS);
  });

  test("resets a column back to a new-session draft", () => {
    const column = createChatColumnState(asQraftAiSessionId("qs-existing"));
    const resetColumn = createResetChatColumnState(column);

    expect(resetColumn.id).toBe(column.id);
    expect(resetColumn.selectedQraftAiSessionId).toBeNull();
    expect(resetColumn.draftSessionId).not.toBe(column.draftSessionId);
  });

  test("keeps at least one column after removal", () => {
    const column = createChatColumnState();
    const remainingColumns = removeChatColumn([column], column.id);

    expect(remainingColumns).toHaveLength(1);
    expect(remainingColumns[0]?.id).not.toBe(column.id);
  });

  test("reuses the focused column when selecting a new session", () => {
    const firstColumn = createChatColumnState();
    const secondColumn = createChatColumnState();
    const columns = [firstColumn, secondColumn];

    expect(
      resolveChatSelectionTargetColumnId({
        columns,
        focusedColumnId: secondColumn.id,
        sessionId: asQraftAiSessionId("qs-target"),
      }),
    ).toBe(secondColumn.id);
  });

  test("focuses an existing column when the session is already open", () => {
    const existingColumn = createChatColumnState(asQraftAiSessionId("qs-live"));
    const draftColumn = createChatColumnState();

    expect(
      resolveChatSelectionTargetColumnId({
        columns: [existingColumn, draftColumn],
        focusedColumnId: draftColumn.id,
        sessionId: asQraftAiSessionId("qs-live"),
      }),
    ).toBe(existingColumn.id);
    expect(
      findChatColumnBySessionId(
        [existingColumn, draftColumn],
        asQraftAiSessionId("qs-live"),
      )?.id,
    ).toBe(existingColumn.id);
  });

  test("falls back to the last remaining column after removing the focused one", () => {
    const firstColumn = createChatColumnState();
    const secondColumn = createChatColumnState();
    const columns = [firstColumn, secondColumn];

    expect(
      resolveFocusedChatColumnIdAfterRemoval({
        columns,
        removedColumnId: secondColumn.id,
        focusedColumnId: secondColumn.id,
      }),
    ).toBe(firstColumn.id);
  });

  test("assigns a selected session to a specific column", () => {
    const column = createChatColumnState();
    const updatedColumns = assignSessionToChatColumn({
      columns: [column],
      columnId: column.id,
      sessionId: asQraftAiSessionId("qs-picked"),
    });

    expect(updatedColumns[0]?.selectedQraftAiSessionId).toBe(
      asQraftAiSessionId("qs-picked"),
    );
  });
});

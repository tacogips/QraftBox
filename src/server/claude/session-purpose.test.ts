import { describe, expect, test } from "bun:test";
import type { TranscriptEvent } from "./session-reader.js";
import {
  buildPurposePrompt,
  createIntentSignature,
  extractUserIntents,
  isToolResponseLikeUserText,
  normalizePurposeText,
  shouldRefreshPurpose,
} from "./session-purpose.js";

describe("session-purpose", () => {
  test("filters tool-response-like user messages", () => {
    expect(isToolResponseLikeUserText('{"tool_result":"ok"}')).toBe(true);
    expect(isToolResponseLikeUserText("bash -lc ls -la")).toBe(true);
    expect(isToolResponseLikeUserText("Implement overview cards")).toBe(false);
  });

  test("extracts only meaningful user intent text", () => {
    const events: TranscriptEvent[] = [
      {
        type: "user",
        raw: {
          message: {
            content: [
              { type: "text", text: "Add overview mode for sessions" },
              { type: "tool_result", text: "ignored" },
            ],
          },
        },
      },
      {
        type: "assistant",
        raw: { message: { content: [{ type: "text", text: "ok" }] } },
      },
      {
        type: "user",
        raw: { message: { content: '```json\n{"stdout":"ok"}\n```' } },
      },
      {
        type: "user",
        raw: { message: { content: "Search in chat history too" } },
      },
    ];

    expect(extractUserIntents(events)).toEqual([
      "Add overview mode for sessions",
      "Search in chat history too",
    ]);
  });

  test("normalizes purpose text and signature", () => {
    const intents = ["A", "B", "C"];
    const signature = createIntentSignature(intents);
    expect(signature.length).toBeGreaterThan(0);
    expect(
      normalizePurposeText(
        "  <qraftbox-system-prompt>internal</qraftbox-system-prompt>  Build  compact cards \n now ",
      ),
    ).toBe("internal Build compact cards now");
  });

  test("refreshes purpose every 3 new user intents", () => {
    expect(shouldRefreshPurpose(1, 3)).toBe(false);
    expect(shouldRefreshPurpose(1, 4)).toBe(true);
    expect(shouldRefreshPurpose(4, 6)).toBe(false);
    expect(shouldRefreshPurpose(4, 7)).toBe(true);
  });

  test("builds purpose prompt with output language requirement", async () => {
    const prompt = await buildPurposePrompt(
      ["Summarize architecture changes", "Update tests"],
      "Japanese",
    );
    expect(prompt).toContain("Write the sentence in Japanese.");
  });
});

import { describe, expect, test } from "bun:test";
import {
  canSubmitEmbeddedAiChatPrompt,
  resolveEmbeddedAiChatPaneLayoutClass,
  resolveEmbeddedAiChatPaneModeOnSessionOpen,
} from "./ai-chat-pane-state";

describe("embedded ai chat pane state", () => {
  test("reopens a collapsed pane in docked mode when a session is selected", () => {
    expect(resolveEmbeddedAiChatPaneModeOnSessionOpen("collapsed")).toBe(
      "docked",
    );
    expect(resolveEmbeddedAiChatPaneModeOnSessionOpen("docked")).toBe("docked");
    expect(resolveEmbeddedAiChatPaneModeOnSessionOpen("expanded")).toBe(
      "expanded",
    );
  });

  test("keeps a single-column layout on phone", () => {
    expect(
      resolveEmbeddedAiChatPaneLayoutClass({
        mode: "expanded",
        isPhoneViewport: true,
      }),
    ).toBe("grid-cols-1");
  });

  test("uses desktop rail and pane widths for each mode", () => {
    expect(
      resolveEmbeddedAiChatPaneLayoutClass({
        mode: "collapsed",
        isPhoneViewport: false,
      }),
    ).toBe("xl:grid-cols-[minmax(0,1fr)_56px]");
    expect(
      resolveEmbeddedAiChatPaneLayoutClass({
        mode: "docked",
        isPhoneViewport: false,
      }),
    ).toBe("xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]");
    expect(
      resolveEmbeddedAiChatPaneLayoutClass({
        mode: "expanded",
        isPhoneViewport: false,
      }),
    ).toBe("xl:grid-cols-[minmax(0,0.82fr)_minmax(26rem,1.18fr)]");
  });

  test("allows starting a fresh chat without an existing session", () => {
    expect(
      canSubmitEmbeddedAiChatPrompt({
        projectPath: "/tmp/repo",
        promptInput: "Explain this diff",
        submitting: false,
        modelProfilesLoading: false,
      }),
    ).toBe(true);
    expect(
      canSubmitEmbeddedAiChatPrompt({
        projectPath: "/tmp/repo",
        promptInput: "   ",
        submitting: false,
        modelProfilesLoading: false,
      }),
    ).toBe(false);
    expect(
      canSubmitEmbeddedAiChatPrompt({
        projectPath: "   ",
        promptInput: "Explain this diff",
        submitting: false,
        modelProfilesLoading: false,
      }),
    ).toBe(false);
  });
});

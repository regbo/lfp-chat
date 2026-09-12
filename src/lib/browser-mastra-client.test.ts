import { describe, expect, test } from "bun:test";

import {
  isTerminalMastraChunk,
  messageContents,
  threadMessageOptions,
  visibleReasoningText,
} from "./browser-mastra-client";

describe("Mastra thread messaging", () => {
  test("sends only the current turn with native run options", () => {
    const options = threadMessageOptions({
      clientMessageId: "message-1",
      message: { text: " Hello ", files: [] },
      resourceId: "resource-1",
      threadId: "thread-1",
      requestContext: { tools: ["web_search"] },
    });

    expect(options).toEqual({
      resourceId: "resource-1",
      threadId: "thread-1",
      message: {
        contents: [{ type: "text", text: "Hello" }],
        metadata: { clientMessageId: "message-1" },
      },
      ifIdle: {
        behavior: "wake",
        attributes: { source: "user" },
        streamOptions: {
          requestContext: { tools: ["web_search"] },
        },
      },
    });
  });

  test("preserves file data for Mastra message signals", () => {
    expect(messageContents({
      text: "",
      files: [{
        type: "file",
        url: "data:image/png;base64,abc",
        mediaType: "image/png",
        filename: "screen.png",
      }],
    })).toEqual([{
      type: "file",
      data: "data:image/png;base64,abc",
      mediaType: "image/png",
      filename: "screen.png",
    }]);
  });

  test("recognizes every native terminal chunk", () => {
    expect(isTerminalMastraChunk({ type: "finish" })).toBe(true);
    expect(isTerminalMastraChunk({
      type: "finish",
      payload: { stepResult: { reason: "tool-calls" } },
    })).toBe(false);
    expect(isTerminalMastraChunk({
      type: "step-finish",
      payload: { stepResult: { isContinued: false } },
    })).toBe(true);
    expect(isTerminalMastraChunk({
      type: "step-finish",
      payload: { stepResult: { isContinued: true } },
    })).toBe(false);
    expect(isTerminalMastraChunk({ type: "error" })).toBe(true);
    expect(isTerminalMastraChunk({ type: "abort" })).toBe(true);
    expect(isTerminalMastraChunk({ type: "tripwire" })).toBe(true);
    expect(isTerminalMastraChunk({ type: "text-delta" })).toBe(false);
  });

  test("normalizes visible reasoning without exposing provider metadata", () => {
    expect(visibleReasoningText({
      type: "reasoning-delta",
      payload: { id: "reasoning-1", text: "Checking the available tools." },
    })).toBe("Checking the available tools.");
    expect(visibleReasoningText({
      type: "reasoning-delta",
      payload: { id: "reasoning-2", delta: "Reviewing the results." },
    })).toBe("Reviewing the results.");
    expect(visibleReasoningText({
      type: "redacted-reasoning",
      payload: { id: "reasoning-3", data: "provider-secret" },
    })).toBe("Some reasoning was withheld by the model.");
    expect(visibleReasoningText({
      type: "reasoning-signature",
      payload: { id: "reasoning-4", signature: "provider-signature" },
    })).toBe("");
  });
});

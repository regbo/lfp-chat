import { describe, expect, test } from "bun:test";

import {
  isTerminalMastraChunk,
  messageContents,
  threadMessageOptions,
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
    expect(isTerminalMastraChunk({ type: "error" })).toBe(true);
    expect(isTerminalMastraChunk({ type: "abort" })).toBe(true);
    expect(isTerminalMastraChunk({ type: "text-delta" })).toBe(false);
  });
});

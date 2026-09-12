import { describe, expect, mock, test } from "bun:test";
import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type { ProcessInputStepArgs } from "@mastra/core/processors";

import { SignalSemanticRecallProcessor } from "@/mastra/signal-semantic-recall";

function message(
  role: MastraDBMessage["role"],
  text: string,
  threadId: string,
  resourceId = "person-1",
): MastraDBMessage {
  return {
    id: `${threadId}-${role}-${text}`,
    role,
    threadId,
    resourceId,
    createdAt: new Date(),
    content: { format: 2, parts: [{ type: "text", text }] },
  };
}

describe("SignalSemanticRecallProcessor", () => {
  test("adds cross-thread semantic context to a queued signal turn", async () => {
    const recall = mock(async () => ({
      messages: [
        message("signal", "The canary is violet-orbit-7391.", "thread-a"),
        message("assistant", "Acknowledged.", "thread-a"),
        message("signal", "What is the canary?", "thread-b"),
      ],
      total: 3,
      page: 0,
      perPage: false as const,
      hasMore: false,
    }));
    const processor = new SignalSemanticRecallProcessor({ recall } as never);
    const state: Record<string, unknown> = {};
    const args = {
      messages: [message("signal", "What is the canary?", "thread-b")],
      state,
      stepNumber: 0,
      systemMessages: [{ role: "system", content: "Base instructions" }],
    } as ProcessInputStepArgs;

    const result = await processor.processInputStep(args);

    expect(recall).toHaveBeenCalledWith({
      resourceId: "person-1",
      threadId: "thread-b",
      perPage: false,
      threadConfig: { lastMessages: false },
      vectorSearchString: "What is the canary?",
    });
    expect(result?.systemMessages).toHaveLength(2);
    expect(JSON.stringify(result?.systemMessages)).toContain("violet-orbit-7391");
    expect(JSON.stringify(result?.systemMessages)).not.toContain(
      "signal: What is the canary?",
    );

    expect(
      await processor.processInputStep({ ...args, stepNumber: 1 }),
    ).toBeUndefined();
    expect(recall).toHaveBeenCalledTimes(1);
  });

  test("leaves ordinary turns to Mastra's native semantic recall", async () => {
    const recall = mock(async () => {
      throw new Error("should not run");
    });
    const processor = new SignalSemanticRecallProcessor({ recall } as never);

    const result = await processor.processInputStep({
      messages: [message("user", "Hello", "thread-a")],
      state: {},
      stepNumber: 0,
      systemMessages: [],
    } as unknown as ProcessInputStepArgs);

    expect(result).toBeUndefined();
    expect(recall).not.toHaveBeenCalled();
  });
});

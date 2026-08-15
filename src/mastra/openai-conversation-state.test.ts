import { describe, expect, test } from "bun:test";
import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type {
  ProcessAPIErrorArgs,
  ProcessInputStepArgs,
  ProcessLLMRequestArgs,
  ProcessOutputResultArgs,
} from "@mastra/core/processors";

import {
  isMissingOpenAiResponseError,
  isOpenAiResponsesModel,
  OpenAiConversationStateProcessor,
  readStoredOpenAiResponseId,
  trimPromptForOpenAiContinuation,
} from "@/mastra/openai-conversation-state";

function message(
  role: MastraDBMessage["role"],
  text: string,
  metadata?: Record<string, unknown>,
): MastraDBMessage {
  return {
    id: `${role}-${text}`,
    role,
    createdAt: new Date(),
    content: {
      format: 2,
      parts: [{ type: "text", text }],
      metadata,
    },
  };
}

describe("OpenAI conversation state", () => {
  test("recognizes Responses models without enabling OpenAI Chat Completions", () => {
    expect(isOpenAiResponsesModel("openai/gpt-5.6-luna")).toBe(true);
    expect(isOpenAiResponsesModel({ provider: "openai.responses" })).toBe(true);
    expect(isOpenAiResponsesModel({ provider: "openai.chat" })).toBe(false);
    expect(isOpenAiResponsesModel({ provider: "ollama.chat" })).toBe(false);
  });

  test("keeps current instructions and only input after the chained response", () => {
    const prompt = [
      { role: "system", content: "Current instructions" },
      { role: "user", content: [{ type: "text", text: "Old question" }] },
      { role: "assistant", content: [{ type: "text", text: "Old answer" }] },
      { role: "user", content: [{ type: "text", text: "New question" }] },
    ] as ProcessLLMRequestArgs["prompt"];

    expect(trimPromptForOpenAiContinuation(prompt)).toEqual([
      prompt[0],
      prompt[3],
    ]);
  });

  test("continues tool loops with only the new tool output", () => {
    const processor = new OpenAiConversationStateProcessor();
    const state: Record<string, unknown> = {};
    const initialArgs = {
      messages: [message("user", "Check the weather")],
      model: { provider: "openai.responses", modelId: "gpt-5.6-luna" },
      providerOptions: {},
      state,
      stepNumber: 0,
      steps: [],
    } as unknown as ProcessInputStepArgs;
    processor.processInputStep(initialArgs);

    expect(
      processor.processInputStep({
        ...initialArgs,
        messages: [
          ...initialArgs.messages,
          message("assistant", "Calling weather"),
        ],
        stepNumber: 1,
        steps: [{ response: { id: "resp_tool_call" } }],
      } as unknown as ProcessInputStepArgs),
    ).toMatchObject({
      providerOptions: {
        openai: { previousResponseId: "resp_tool_call", store: true },
      },
    });

    const prompt = [
      { role: "system", content: "Current instructions" },
      { role: "user", content: [{ type: "text", text: "Check the weather" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call_1", toolName: "weather", input: {} }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call_1", toolName: "weather", output: { type: "text", value: "Sunny" } }],
      },
    ] as ProcessLLMRequestArgs["prompt"];
    expect(
      processor.processLLMRequest({ prompt, state } as unknown as ProcessLLMRequestArgs),
    ).toEqual({ prompt: [prompt[0], prompt[3]] });
  });

  test("stores the final provider response and chains the next turn", () => {
    const processor = new OpenAiConversationStateProcessor();
    const state: Record<string, unknown> = {};
    const firstMessages = [message("user", "Hello")];

    const firstOptions = processor.processInputStep({
      messages: firstMessages,
      model: { provider: "openai.responses", modelId: "gpt-5.6-luna" },
      providerOptions: { openai: { reasoningEffort: "high" } },
      state,
      stepNumber: 0,
      steps: [],
    } as unknown as ProcessInputStepArgs);

    expect(firstOptions).toMatchObject({
      providerOptions: {
        openai: {
          previousResponseId: null,
          reasoningEffort: "high",
          store: true,
        },
      },
    });

    const assistant = message("assistant", "Hi");
    processor.processOutputResult({
      messages: [assistant],
      result: { steps: [{ response: { id: "resp_first" } }] },
      state,
    } as unknown as ProcessOutputResultArgs);
    expect(readStoredOpenAiResponseId([assistant])).toBe("resp_first");

    const nextState: Record<string, unknown> = {};
    const nextOptions = processor.processInputStep({
      messages: [assistant, message("user", "Continue")],
      model: { provider: "openai.responses", modelId: "gpt-5.6-luna" },
      providerOptions: { openai: { reasoningEffort: "medium" } },
      state: nextState,
      stepNumber: 0,
      steps: [],
    } as unknown as ProcessInputStepArgs);

    expect(nextOptions).toMatchObject({
      providerOptions: {
        openai: {
          previousResponseId: "resp_first",
          reasoningEffort: "medium",
          store: true,
        },
      },
    });
  });

  test("falls back to local history once when stored provider state expires", () => {
    const processor = new OpenAiConversationStateProcessor();
    const assistant = message("assistant", "Earlier answer");
    const initialState: Record<string, unknown> = {};
    processor.processInputStep({
      messages: [message("user", "Earlier question")],
      model: { provider: "openai.responses", modelId: "gpt-5.6-luna" },
      providerOptions: {},
      state: initialState,
      stepNumber: 0,
      steps: [],
    } as unknown as ProcessInputStepArgs);
    processor.processOutputResult({
      messages: [assistant],
      result: { steps: [{ response: { id: "resp_expired" } }] },
      state: initialState,
    } as unknown as ProcessOutputResultArgs);

    const state: Record<string, unknown> = {};
    const args = {
      messages: [assistant, message("user", "New question")],
      model: { provider: "openai.responses", modelId: "gpt-5.6-luna" },
      providerOptions: {},
      state,
      stepNumber: 0,
      steps: [],
    } as unknown as ProcessInputStepArgs;
    processor.processInputStep(args);

    expect(
      processor.processAPIError({
        error: new Error("previous_response_id resp_expired was not found"),
        retryCount: 0,
        state,
      } as unknown as ProcessAPIErrorArgs),
    ).toEqual({ retry: true });
    expect(processor.processInputStep(args)).toMatchObject({
      providerOptions: { openai: { previousResponseId: null, store: true } },
    });

    const prompt = [
      { role: "user", content: [{ type: "text", text: "Earlier question" }] },
      { role: "assistant", content: [{ type: "text", text: "Earlier answer" }] },
      { role: "user", content: [{ type: "text", text: "New question" }] },
    ] as ProcessLLMRequestArgs["prompt"];
    expect(
      processor.processLLMRequest({ prompt, state } as unknown as ProcessLLMRequestArgs),
    ).toBeUndefined();
  });

  test("only retries errors that specifically invalidate stored response state", () => {
    expect(
      isMissingOpenAiResponseError(
        new Error("Previous response was deleted and does not exist"),
      ),
    ).toBe(true);
    expect(
      isMissingOpenAiResponseError(
        new Error("No response found with id 'resp_expired'"),
      ),
    ).toBe(true);
    expect(isMissingOpenAiResponseError(new Error("Rate limit exceeded"))).toBe(
      false,
    );
  });
});

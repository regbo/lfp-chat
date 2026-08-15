import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type {
  ProcessAPIErrorArgs,
  ProcessInputStepArgs,
  ProcessInputStepResult,
  ProcessLLMRequestArgs,
  ProcessLLMRequestResult,
  ProcessOutputResultArgs,
  Processor,
} from "@mastra/core/processors";

const RESPONSE_ID_METADATA_KEY = "lfpChatOpenAiResponseId";
const STATE_ACTIVE_KEY = "lfpChatOpenAiStateActive";
const STATE_CONTINUATION_KEY = "lfpChatOpenAiContinuation";
const STATE_HISTORY_FALLBACK_KEY = "lfpChatOpenAiHistoryFallback";
const STATE_LAST_MODEL_KEY = "lfpChatLastModelWasOpenAi";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function openAiResponseId(value: unknown): string | undefined {
  const responseId = nonEmptyString(value);
  return responseId?.startsWith("resp_") ? responseId : undefined;
}

function responseIdFromStep(step: unknown): string | undefined {
  const record = asRecord(step);
  const responseId = openAiResponseId(asRecord(record?.response)?.id);
  if (responseId) return responseId;

  return openAiResponseId(
    asRecord(asRecord(record?.providerMetadata)?.openai)?.responseId,
  );
}

function latestAssistant(messages: MastraDBMessage[]) {
  return messages.findLast((message) => message.role === "assistant");
}

/** Returns the provider response that immediately precedes the current turn. */
export function readStoredOpenAiResponseId(
  messages: MastraDBMessage[],
): string | undefined {
  return openAiResponseId(
    latestAssistant(messages)?.content.metadata?.[RESPONSE_ID_METADATA_KEY],
  );
}

/**
 * Mastra keeps the complete transcript for persistence and UI rendering. Once
 * OpenAI has that transcript in a stored response chain, only current system
 * context and messages after the last assistant response should cross the
 * provider boundary.
 */
export function trimPromptForOpenAiContinuation(
  prompt: ProcessLLMRequestArgs["prompt"],
): ProcessLLMRequestArgs["prompt"] | undefined {
  const boundary = prompt.findLastIndex((message) => message.role === "assistant");
  if (boundary < 0) return undefined;

  return prompt.filter(
    (message, index) => message.role === "system" || index > boundary,
  );
}

/** Restrict provider-state behavior to OpenAI Responses models. */
export function isOpenAiResponsesModel(model: unknown): boolean {
  if (typeof model === "string") return model.startsWith("openai/");

  const provider = nonEmptyString(asRecord(model)?.provider);
  if (!provider || provider === "openai.chat") return false;
  return provider === "openai" || provider.startsWith("openai.responses");
}

function errorText(error: unknown): string {
  const record = asRecord(error);
  return [
    error instanceof Error ? error.message : undefined,
    typeof error === "string" ? error : undefined,
    nonEmptyString(record?.responseBody),
    nonEmptyString(asRecord(record?.cause)?.message),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function isMissingOpenAiResponseError(error: unknown): boolean {
  const text = errorText(error);
  const stateReference =
    /previous[_\s-]*response|previous_response_id|\bresp_[a-z0-9_-]+\b/i;
  const unavailable = /not found|expired|deleted|does not exist|invalid/i;
  return stateReference.test(text) && unavailable.test(text);
}

function openAiOptions(
  providerOptions: ProcessInputStepArgs["providerOptions"],
): UnknownRecord {
  return asRecord(asRecord(providerOptions)?.openai) ?? {};
}

function withOpenAiState(
  providerOptions: ProcessInputStepArgs["providerOptions"],
  previousResponseId: string | null,
): ProcessInputStepResult {
  return {
    providerOptions: {
      ...providerOptions,
      openai: {
        ...openAiOptions(providerOptions),
        previousResponseId,
        store: true,
      },
    },
  };
}

/**
 * Bridges Mastra's persisted message history to OpenAI's stored Responses
 * state without changing what Mastra saves. The processor uses native Mastra
 * provider options and transient prompt rewriting; it never calls OpenAI
 * outside Mastra's model provider.
 */
export class OpenAiConversationStateProcessor implements Processor {
  readonly id = "openai-conversation-state";
  readonly name = "OpenAI Conversation State";

  processInputStep({
    messages,
    model,
    providerOptions,
    state,
    stepNumber,
    steps,
  }: ProcessInputStepArgs): ProcessInputStepResult | void {
    if (!isOpenAiResponsesModel(model)) {
      state[STATE_ACTIVE_KEY] = false;
      state[STATE_CONTINUATION_KEY] = false;
      state[STATE_LAST_MODEL_KEY] = false;
      return;
    }

    const configured = openAiOptions(providerOptions);
    // An explicit retention opt-out takes precedence over provider state.
    if (configured.store === false || nonEmptyString(configured.conversation)) {
      state[STATE_ACTIVE_KEY] = false;
      state[STATE_CONTINUATION_KEY] = false;
      state[STATE_LAST_MODEL_KEY] = true;
      return;
    }

    const previousStepWasOpenAi = state[STATE_LAST_MODEL_KEY] === true;
    state[STATE_LAST_MODEL_KEY] = true;
    state[STATE_ACTIVE_KEY] = true;
    if (state[STATE_HISTORY_FALLBACK_KEY] === true) {
      state[STATE_CONTINUATION_KEY] = false;
      return withOpenAiState(providerOptions, null);
    }

    const previousResponseId =
      stepNumber > 0
        ? previousStepWasOpenAi
          ? responseIdFromStep(steps.at(-1))
          : undefined
        : openAiResponseId(configured.previousResponseId) ??
          readStoredOpenAiResponseId(messages);

    state[STATE_CONTINUATION_KEY] = Boolean(previousResponseId);
    return withOpenAiState(providerOptions, previousResponseId ?? null);
  }

  processLLMRequest({
    prompt,
    state,
  }: ProcessLLMRequestArgs): ProcessLLMRequestResult {
    if (state[STATE_CONTINUATION_KEY] !== true) return;
    const trimmed = trimPromptForOpenAiContinuation(prompt);
    return trimmed ? { prompt: trimmed } : undefined;
  }

  processOutputResult({
    messages,
    result,
    state,
  }: ProcessOutputResultArgs) {
    if (state[STATE_ACTIVE_KEY] !== true) return messages;

    const responseId = responseIdFromStep(result.steps.at(-1));
    const assistant = latestAssistant(messages);
    if (!responseId || !assistant) return messages;

    assistant.content.metadata = {
      ...assistant.content.metadata,
      [RESPONSE_ID_METADATA_KEY]: responseId,
    };
    return messages;
  }

  processAPIError({
    error,
    retryCount,
    state,
  }: ProcessAPIErrorArgs) {
    if (
      retryCount > 0 ||
      state[STATE_CONTINUATION_KEY] !== true ||
      !isMissingOpenAiResponseError(error)
    ) {
      return;
    }

    // Stored response chains expire. Retry once with Mastra's unchanged local
    // history, then persist the fresh response ID for following turns.
    state[STATE_HISTORY_FALLBACK_KEY] = true;
    state[STATE_CONTINUATION_KEY] = false;
    return { retry: true } as const;
  }
}

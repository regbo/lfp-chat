"use client";

import { MastraClient } from "@mastra/client-js";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

export type MastraStreamChunk = {
  type: string;
  payload?: unknown;
  runId?: string;
};

export function messageContents(message: PromptInputMessage) {
  return [
    ...(message.text.trim()
      ? [{ type: "text" as const, text: message.text.trim() }]
      : []),
    ...message.files.map((file) => ({
      type: "file" as const,
      data: file.url,
      mediaType: file.mediaType,
      filename: file.filename,
    })),
  ];
}

export function threadMessageOptions(options: {
  clientMessageId: string;
  message: PromptInputMessage;
  resourceId: string;
  threadId: string;
  requestContext: Record<string, unknown>;
}) {
  return {
    resourceId: options.resourceId,
    threadId: options.threadId,
    message: {
      contents: messageContents(options.message),
      metadata: { clientMessageId: options.clientMessageId },
    },
    ifIdle: {
      behavior: "wake" as const,
      attributes: { source: "user" },
      streamOptions: {
        requestContext: options.requestContext,
      },
    },
  };
}

export function isTerminalMastraChunk(chunk: MastraStreamChunk) {
  if (chunk.type === "error" || chunk.type === "abort") return true;
  if (chunk.type !== "finish") return false;
  const payload = chunk.payload && typeof chunk.payload === "object"
    ? chunk.payload as Record<string, unknown>
    : {};
  const stepResult = payload.stepResult;
  const reason = stepResult && typeof stepResult === "object"
    ? (stepResult as Record<string, unknown>).reason
    : undefined;
  return reason !== "tool-calls";
}

/**
 * Mastra owns thread subscriptions, replay, reconnects, and aborts. Keeping the
 * browser client standard avoids a second stream lifecycle in the chat UI.
 */
export const browserMastraClient = new MastraClient({
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  apiPrefix: "/api/mastra",
  retries: 2,
  backoffMs: 250,
  maxBackoffMs: 1_000,
});

"use client";

import { MastraClient } from "@mastra/client-js";

export type MastraStreamChunk = {
  type: string;
  payload?: Record<string, unknown>;
  runId?: string;
};

export type MastraStreamResponse = Response & {
  processDataStream: (options: {
    onChunk: (chunk: MastraStreamChunk) => void | Promise<void>;
  }) => Promise<void>;
};

type StreamChatOptions = {
  agentId: string;
  messages: unknown[];
  runId: string;
  threadId: string;
  resourceId: string;
  requestContext: Record<string, unknown>;
  signal: AbortSignal;
};

export function streamChatRequestBody(options: StreamChatOptions) {
  return {
    messages: options.messages,
    runId: options.runId,
    memory: { thread: options.threadId, resource: options.resourceId },
    requestContext: options.requestContext,
    untilIdle: { maxIdleMs: 15_000 },
  };
}

export async function processMastraStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onChunk: (chunk: MastraStreamChunk) => void | Promise<void>,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const abort = () => void reader.cancel();
  signal.addEventListener("abort", abort, { once: true });

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const line = event.split("\n").find((part) => part.startsWith("data: "));
        if (!line) continue;
        const data = line.slice(6);
        if (data === "[DONE]") {
          completed = true;
          return;
        }
        const chunk = JSON.parse(data) as MastraStreamChunk;
        if (chunk.type === "finish") completed = true;
        await onChunk(chunk);
      }
    }
    if (!signal.aborted && !completed) {
      throw new Error("Chat stream disconnected before the run finished.");
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/**
 * Browser client for Mastra's standard agent route. Thread and run routing is
 * passed per request so simultaneous conversations never share mutable client
 * headers or resend their complete transcripts.
 */
class LfpMastraClient extends MastraClient {
  async streamChat(options: StreamChatOptions): Promise<MastraStreamResponse> {
    const response = await fetch(
      `/api/mastra/agents/${encodeURIComponent(options.agentId)}/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(streamChatRequestBody(options)),
        signal: options.signal,
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Mastra returned HTTP ${response.status}.`);
    }
    if (!response.body) throw new Error("Mastra returned an empty stream.");

    const streamResponse = response as MastraStreamResponse;
    streamResponse.processDataStream = ({ onChunk }) =>
      processMastraStream(response.body!, options.signal, onChunk);
    return streamResponse;
  }

  /** Reconnects to Mastra's retained event stream after a browser suspension. */
  async observeChat(options: {
    agentId: string;
    runId: string;
    offset: number;
    signal: AbortSignal;
  }): Promise<MastraStreamResponse> {
    const response = await fetch(
      `/api/mastra/agents/${encodeURIComponent(options.agentId)}/observe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: options.runId, offset: options.offset }),
        signal: options.signal,
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Mastra returned HTTP ${response.status}.`);
    }
    if (!response.body) throw new Error("Mastra returned an empty stream.");

    const streamResponse = response as MastraStreamResponse;
    streamResponse.processDataStream = ({ onChunk }) =>
      processMastraStream(response.body!, options.signal, onChunk);
    return streamResponse;
  }
}

export const browserMastraClient = new LfpMastraClient({
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  apiPrefix: "/api/mastra",
  retries: 2,
  backoffMs: 250,
  maxBackoffMs: 1_000,
});

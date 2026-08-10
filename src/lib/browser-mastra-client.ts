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

async function processMastraStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onChunk: (chunk: MastraStreamChunk) => void | Promise<void>,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (data === "[DONE]") return;
        await onChunk(JSON.parse(data) as MastraStreamChunk);
      }
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
  async streamChat(options: {
    agentId: string;
    messages: unknown[];
    runId: string;
    threadId: string;
    resourceId: string;
    requestContext: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<MastraStreamResponse> {
    const response = await fetch(
      `/api/mastra/agents/${encodeURIComponent(options.agentId)}/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: options.messages,
          runId: options.runId,
          memory: { thread: options.threadId, resource: options.resourceId },
          requestContext: options.requestContext,
        }),
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

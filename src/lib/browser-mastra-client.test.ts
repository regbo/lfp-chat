import { describe, expect, test } from "bun:test";

import {
  processMastraStream,
  type MastraStreamChunk,
} from "./browser-mastra-client";

function sseStream(events: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

describe("Mastra stream processing", () => {
  test("accepts a terminal finish event", async () => {
    const chunks: MastraStreamChunk[] = [];
    await processMastraStream(
      sseStream(['data: {"type":"finish"}\n\n']),
      new AbortController().signal,
      (chunk) => { chunks.push(chunk); },
    );
    expect(chunks).toEqual([{ type: "finish" }]);
  });

  test("accepts the SSE done sentinel", async () => {
    await expect(processMastraStream(
      sseStream(["data: [DONE]\n\n"]),
      new AbortController().signal,
      () => undefined,
    )).resolves.toBeUndefined();
  });

  test("reports an interrupted stream so the caller can reconnect", async () => {
    await expect(processMastraStream(
      sseStream(['data: {"type":"text-delta","payload":{"text":"Hi"}}\n\n']),
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow("disconnected before the run finished");
  });
});

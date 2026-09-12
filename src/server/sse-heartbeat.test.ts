import { describe, expect, test } from "bun:test";

import { withSseHeartbeat } from "@/server/sse-heartbeat";

describe("withSseHeartbeat", () => {
  test("emits a heartbeat while an SSE source is idle", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => controller.close(), 40);
      },
    });
    const response = withSseHeartbeat(new Response(source, {
      headers: { "content-type": "text/event-stream" },
    }), 5);

    expect(await response.text()).toContain(": heartbeat\n\n");
  });

  test("leaves ordinary responses untouched", () => {
    const response = new Response("ok", { headers: { "content-type": "text/plain" } });
    expect(withSseHeartbeat(response)).toBe(response);
  });
});

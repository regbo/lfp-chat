const encoder = new TextEncoder();
const HEARTBEAT = encoder.encode(": heartbeat\n\n");

/** Keep long-lived event streams active across proxies with short idle timeouts. */
export function withSseHeartbeat(response: Response, intervalMs = 5_000): Response {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    return response;
  }

  const reader = response.body.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => {
        if (!closed) controller.enqueue(HEARTBEAT);
      }, intervalMs);

      void (async () => {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            controller.enqueue(chunk.value);
          }
          closed = true;
          controller.close();
        } catch (error) {
          closed = true;
          controller.error(error);
        } finally {
          if (timer) clearInterval(timer);
          reader.releaseLock();
        }
      })();
    },
    async cancel(reason) {
      closed = true;
      if (timer) clearInterval(timer);
      await reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

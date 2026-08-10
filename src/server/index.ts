import "@/lib/load-openai-secret";

import { MastraServer } from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";

import { serverConfig } from "@/lib/config";
import { mastra } from "@/mastra";
import { getModelCatalog } from "@/mastra/model-provider";
import {
  prepareDirectCodexRun,
  streamDirectCodexRun,
} from "@/mastra/codex-stream";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: serverConfig.webOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-mastra-client-type"],
  }),
);

app.get("/health", (context) =>
  context.json({ service: "lfp-chat-mastra", status: "ok" }),
);

app.get("/models", async (context) => {
  const catalog = await getModelCatalog();
  context.header(
    "Cache-Control",
    "private, max-age=60, stale-while-revalidate=600",
  );
  return context.json(catalog);
});

app.post("/api/codex/stream", async (context) => {
  if (!serverConfig.codexAgentEnabled) {
    return context.json({ error: "Codex ACP is disabled." }, 404);
  }
  try {
    const run = await prepareDirectCodexRun(await context.req.json());
    return streamSSE(context, async (stream) => {
      try {
        await streamDirectCodexRun(
          run,
          (chunk) => stream.writeSSE({ data: JSON.stringify(chunk) }),
          context.req.raw.signal,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Codex run failed.";
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            runId: run.runId,
            payload: { error: message },
          }),
        });
      } finally {
        await stream.writeSSE({ data: "[DONE]" });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Codex request.";
    return context.json({ error: message }, 400);
  }
});

const server = new MastraServer({ app, mastra });
await server.init();
await mastra.startWorkers();

const port = Number(process.env.MASTRA_PORT ?? 4111);

console.info(
  `LFP Chat Mastra Server listening on http://${serverConfig.mastraHost}:${port}`,
);

const bunServer = {
  hostname: serverConfig.mastraHost,
  port,
  fetch: app.fetch,
};

export default bunServer;

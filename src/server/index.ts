import "@/lib/load-openai-secret";

import { MastraServer } from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { serverConfig } from "@/lib/config";
import { mastra } from "@/mastra";
import { getModelCatalog } from "@/mastra/model-provider";

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

const server = new MastraServer({ app, mastra });
await server.init();
await mastra.startWorkers();

const port = Number(process.env.MASTRA_PORT ?? 4111);

console.info(`LFP Chat Mastra Server listening on http://localhost:${port}`);

const bunServer = {
  hostname: "0.0.0.0",
  port,
  fetch: app.fetch,
};

export default bunServer;

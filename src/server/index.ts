import "@/lib/load-openai-secret";

import { MastraServer } from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { serverConfig } from "@/lib/config";
import { mastra } from "@/mastra/runtime";
import { getModelCatalog } from "@/mastra/model-provider";
import { runDashboardWidget } from "@/mastra/dashboard-refresh";

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

app.post("/dashboard/widgets/:widgetId/run", async (context) => {
  const input = await context.req.json<{ resourceId?: string; force?: boolean }>();
  if (!input.resourceId) return context.json({ error: "resourceId is required." }, 400);
  try {
    return context.json(await runDashboardWidget(
      input.resourceId,
      context.req.param("widgetId"),
      { force: input.force ?? false },
    ));
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "Could not refresh the widget." }, 500);
  }
});

const server = new MastraServer({ app, mastra });
await server.init();
await mastra.startWorkers();

const port = Number(process.env.MASTRA_PORT ?? 4111);

console.info(
  `${serverConfig.appBranding.fullName} Mastra server listening on http://${serverConfig.mastraHost}:${port}`,
);

const bunServer = {
  hostname: serverConfig.mastraHost,
  port,
  fetch: app.fetch,
  // AgentController keeps one SSE subscription open per browser session and
  // emits a heartbeat every 25 seconds. Bun's 10-second default would close
  // an otherwise healthy idle stream before Mastra can send that heartbeat.
  idleTimeout: 60,
};

export default bunServer;

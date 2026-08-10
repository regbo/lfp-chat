import { chatRoute, smoothStream } from "@mastra/ai-sdk";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

import { getProviderSetupMessage, serverConfig } from "@/lib/config";
import {
  modelProvider,
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";
import { calculatorTool, montyTool, searchTool } from "@/mastra/tools";

const globalForMastra = globalThis as typeof globalThis & {
  lfpMastra?: {
    mastra: Mastra;
    memory: Memory;
  };
};

function createMastra() {
  const storage = new PostgresStore({
    id: "lfp-chat-postgres",
    connectionString: serverConfig.databaseUrl,
  });

  const memory = new Memory({
    storage,
    options: {
      lastMessages: 24,
      generateTitle: true,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: [
          "# User context",
          "- Name:",
          "- Preferences:",
          "- Current goals:",
          "- Important constraints:",
        ].join("\n"),
      },
    },
  });

  const chatAgent = new Agent({
    id: "chatAgent",
    name: "LFP Chat",
    description: "A concise, tool-capable assistant with persistent memory.",
    model: ({ requestContext }) => resolveRuntimeModel(requestContext),
    memory,
    tools: {
      search: searchTool,
      calculator: calculatorTool,
      monty: montyTool,
      ...modelProvider.tools,
    },
    backgroundTasks: {
      tools: {
        monty: { enabled: true, timeoutMs: 30_000 },
      },
    },
    instructions: `You are LFP Chat, a capable and concise assistant.

Use the local search tool when a question concerns this project's stack, Mastra, memory, or tool-event behavior. Use the calculator for simple arithmetic. Use Monty for lightweight isolated Python. ${modelProvider.capabilityInstructions} When multiple tools are relevant, call them in the same step so the interface can present a grouped tool summary.

Be direct and useful. Use short paragraphs and lists only when they improve clarity. Remember stable user preferences in working memory, but do not store secrets or sensitive credentials.`,
    defaultOptions: ({ requestContext }) =>
      resolveRuntimeOptions(requestContext),
  });

  const mastra = new Mastra({
    agents: { chatAgent },
    tools: { search: searchTool, calculator: calculatorTool, monty: montyTool },
    storage,
    backgroundTasks: {
      enabled: true,
      globalConcurrency: 4,
      perAgentConcurrency: 2,
      backpressure: "queue",
      defaultTimeoutMs: 60_000,
      progressThrottleMs: 250,
    },
    scheduler: {
      enabled: true,
      tickIntervalMs: 10_000,
      batchSize: 100,
    },
    server: {
      cors: {
        origin: [serverConfig.webOrigin],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "x-mastra-client-type"],
      },
      apiRoutes: [
        chatRoute({
          path: "/chat",
          agent: "chatAgent",
          version: "v6",
          experimentalTransform: smoothStream({
            delayInMs: 12,
            chunking: "word",
          }),
          sendReasoning: true,
          sendSources: true,
          defaultOptions: {
            untilIdle: { maxIdleMs: 120_000 },
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : "Chat failed.";
            if (/api key|api_key|authentication|unauthorized/i.test(message)) {
              return getProviderSetupMessage();
            }
            return message;
          },
        }),
      ],
    },
  });

  return { mastra, memory };
}

export const { mastra, memory } =
  globalForMastra.lfpMastra ?? (globalForMastra.lfpMastra = createMastra());

import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

import { serverConfig } from "@/lib/config";
import {
  modelProvider,
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";
import {
  calculatorTool,
  familyGraphTool,
  familySqlTool,
  montyTool,
  searchTool,
} from "@/mastra/tools";
import { hostWorkspace } from "@/mastra/host-workspace";
import { createCodexAgent } from "@/mastra/codex-agent";
import {
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";

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
    tools: ({ requestContext }) => {
      const enabled = new Set<string>(
        normalizeEnabledToolIds(requestContext.get(TOOLS_CONTEXT_KEY)),
      );
      const availableTools = {
        search: searchTool,
        calculator: calculatorTool,
        monty: montyTool,
        family_sql: familySqlTool,
        family_graph: familyGraphTool,
        ...modelProvider.tools,
      };
      return Object.fromEntries(
        Object.entries(availableTools).filter(([id]) => enabled.has(id)),
      );
    },
    workspace: ({ requestContext }) =>
      normalizeEnabledToolIds(requestContext.get(TOOLS_CONTEXT_KEY)).includes(
        "code_mode",
      )
        ? hostWorkspace
        : undefined,
    instructions: ({ requestContext }) => {
      const enabled = normalizeEnabledToolIds(
        requestContext.get(TOOLS_CONTEXT_KEY),
      );
      return `You are LFP Chat, a capable and concise assistant.

The user has enabled these capabilities for this run: ${enabled.join(", ") || "none"}. Only use tools that are enabled. Use project search for this app's stack, calculator for arithmetic, and Monty for isolated Python. For questions about family email, documents, attachments, deadlines, ingestion, or processing, generate a focused read-only query with family_sql. Use family_graph for semantic relationships and temporal facts; call family_sql and family_graph together when both structured evidence and graph context are useful. When Code mode is enabled, the workspace tools operate directly on the host filesystem and shell; do not read secrets or modify unrelated files unless the user explicitly asks. ${modelProvider.capabilityInstructions} When multiple tools are relevant, call them in the same step so the interface can present a grouped tool summary.

Be direct and useful. Use short paragraphs and lists only when they improve clarity. Remember stable user preferences in working memory, but do not store secrets or sensitive credentials.`;
    },
    defaultOptions: ({ requestContext }) =>
      resolveRuntimeOptions(requestContext),
  });

  const codexAgent = serverConfig.codexAgentEnabled
    ? createCodexAgent(memory)
    : undefined;

  const mastra = new Mastra({
    agents: {
      chatAgent,
      ...(codexAgent ? { codexAgent } : {}),
    },
    tools: {
      search: searchTool,
      calculator: calculatorTool,
      monty: montyTool,
      family_sql: familySqlTool,
      family_graph: familyGraphTool,
    },
    storage,
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
    },
  });

  return { mastra, memory };
}

export const { mastra, memory } =
  globalForMastra.lfpMastra ?? (globalForMastra.lfpMastra = createMastra());

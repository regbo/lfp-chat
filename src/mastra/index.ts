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
  familyAttachmentTool,
  familyAutomationListTool,
  familyAutomationUpsertTool,
  familyEmailTool,
  familyGraphTool,
  familySearchTool,
  familyDatabaseTool,
  familyTaskCreateTool,
  familyTaskListTool,
  familyTaskUpdateTool,
  montyTool,
  searchTool,
} from "@/mastra/tools";
import { hostWorkspace } from "@/mastra/host-workspace";
import { createCodexAgent } from "@/mastra/codex-agent";
import {
  scheduleCreateTool,
  scheduleListTool,
} from "@/mastra/schedule-tools";
import {
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import { jobMemoryRecallTool } from "@/mastra/job-memory-tool";
import { scheduleParseTool } from "@/mastra/schedule-parser";

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
      const isScheduledJob = requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true;
      const availableTools = {
        search: searchTool,
        calculator: calculatorTool,
        monty: montyTool,
        family_database: familyDatabaseTool,
        family_search: familySearchTool,
        family_graph: familyGraphTool,
        family_email: familyEmailTool,
        family_attachment: familyAttachmentTool,
        family_task_list: familyTaskListTool,
        family_task_create: familyTaskCreateTool,
        family_task_update: familyTaskUpdateTool,
        family_automation_list: familyAutomationListTool,
        family_automation_upsert: familyAutomationUpsertTool,
        schedule_create: scheduleCreateTool,
        schedule_list: scheduleListTool,
        schedule_parse: scheduleParseTool,
        job_memory_recall: jobMemoryRecallTool,
        ...modelProvider.tools,
      };
      return Object.fromEntries(
        Object.entries(availableTools).filter(
          ([id]) =>
            enabled.has(id) ||
            (enabled.has("family_tasks") &&
              (id.startsWith("family_task_") || id.startsWith("family_automation_"))) ||
            (enabled.has("scheduling") && id.startsWith("schedule_")) ||
            (isScheduledJob && id === "job_memory_recall"),
        ),
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
      const scheduledJobInstructions =
        requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
          ? "This run belongs to a scheduled job with its own private history. Use job_memory_recall before answering whenever the task asks for novelty, non-repetition, continuity, or comparison with prior runs. Previous outputs are recorded automatically; never use another job or ordinary chat as this job's memory."
          : "";
      return `You are LFP Chat, a capable and concise assistant.

The user has enabled these capabilities for this run: ${enabled.join(", ") || "none"}. Only use tools that are enabled. ${scheduledJobInstructions} Use project search for this app's stack, calculator for arithmetic, and Monty for isolated Python. For questions about family email, documents, attachments, deadlines, ingestion, or processing, use family_search for semantic and full-text retrieval and family_database for structured filters or aggregation. Use family_graph for temporal relationships and derived facts. Use family_email and family_attachment only when the user needs actual archived content, a MIME structure, or original bytes; first use family_search or family_database to find the required UUID. Use family task tools whenever the user asks to view, create, assign, complete, or change household todos. When the user says "every time", "whenever ingestion finds", or otherwise asks for ongoing behavior based on newly ingested records, create a persistent extraction directive plus automation rule with family_automation_upsert instead of creating a single task. When the user asks for work on a time cadence (for example every Tuesday, daily, or monthly), use schedule_create. Put only the recurring work in its prompt, and pass the cadence as either the user's plain-language schedule or a cron expression. Include the user's timezone when it is known. The scheduling tool checks for equivalent existing work before creation. Call relevant retrieval tools together when their evidence is complementary. When Code mode is enabled, the workspace tools operate directly on the host filesystem and shell; do not read secrets or modify unrelated files unless the user explicitly asks. ${modelProvider.capabilityInstructions} When multiple tools are relevant, call them in the same step so the interface can present a grouped tool summary.

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
      family_database: familyDatabaseTool,
      family_search: familySearchTool,
      family_graph: familyGraphTool,
      family_email: familyEmailTool,
      family_attachment: familyAttachmentTool,
      family_task_list: familyTaskListTool,
      family_task_create: familyTaskCreateTool,
      family_task_update: familyTaskUpdateTool,
      family_automation_list: familyAutomationListTool,
      family_automation_upsert: familyAutomationUpsertTool,
      schedule_create: scheduleCreateTool,
      schedule_list: scheduleListTool,
      schedule_parse: scheduleParseTool,
      job_memory_recall: jobMemoryRecallTool,
    },
    storage,
    scheduler: {
      enabled: true,
      tickIntervalMs: 10_000,
      batchSize: 100,
    },
    schedules: {
      // Inject job memory at fire time so schedules created before this feature
      // receive it without requiring a user to recreate or edit them.
      prepare: ({ schedule }) => {
        const stored = schedule as typeof schedule & {
          ifIdle?: {
            behavior?: "persist" | "discard" | "wake";
            attributes?: Record<string, string | number | boolean | null>;
            streamOptions?: { requestContext?: Record<string, unknown> };
          };
        };
        return {
          ifIdle: {
            ...stored.ifIdle,
            streamOptions: {
              ...stored.ifIdle?.streamOptions,
              requestContext: {
                ...stored.ifIdle?.streamOptions?.requestContext,
                [SCHEDULE_JOB_CONTEXT_KEY]: true,
              },
            },
          },
        };
      },
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

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
  montyTool,
  searchTool,
} from "@/mastra/tools";
import {
  dashboardArchiveTool,
  dashboardListTool,
  dashboardUpsertWidgetTool,
} from "@/mastra/dashboard-tools";
import { dashboardSqlTool, dashboardWebFetchTool } from "@/mastra/dashboard-source-tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";
import {
  taskCreateTool, taskDeleteTool, taskListCreateTool, taskListDeleteTool,
  taskListListsTool, taskListTool, taskListUpdateTool, taskUpdateTool,
} from "@/mastra/task-tools";
import { ensureDashboardCapabilities } from "@/mastra/dashboard-capabilities";
import { renderChartTool } from "@/mastra/chart-tool";
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
import { notifyResource } from "@/lib/push-notifications";
import { notificationSendTool } from "@/mastra/notification-tool";
import { createObservability } from "@/mastra/observability";
import { DEFAULT_WRITING_STYLE_INSTRUCTIONS } from "@/mastra/writing-style-instructions";

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

  // The runtime is generated from real Mastra tools. Only deterministic,
  // read-oriented tools are exposed to persisted widget programs by default.
  ensureDashboardCapabilities();

  const chatAgent = new Agent({
    id: "chatAgent",
    name: serverConfig.appBranding.fullName,
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
        render_chart: renderChartTool,
        web_fetch: dashboardWebFetchTool,
        url_fetch: urlFetchTool,
        ...(serverConfig.dashboard.sqlDatabaseUrl ? { sql_query: dashboardSqlTool } : {}),
        dashboard_upsert_widget: dashboardUpsertWidgetTool,
        dashboard_list: dashboardListTool,
        dashboard_archive: dashboardArchiveTool,
        task_list: taskListTool,
        task_list_lists: taskListListsTool,
        task_list_create: taskListCreateTool,
        task_list_update: taskListUpdateTool,
        task_list_delete: taskListDeleteTool,
        task_create: taskCreateTool,
        task_update: taskUpdateTool,
        task_delete: taskDeleteTool,
        schedule_create: scheduleCreateTool,
        schedule_list: scheduleListTool,
        schedule_parse: scheduleParseTool,
        job_memory_recall: jobMemoryRecallTool,
        notification_send: notificationSendTool,
        ...(isScheduledJob ? {} : modelProvider.tools),
      };
      return Object.fromEntries(
        Object.entries(availableTools).filter(
          ([id]) =>
            enabled.has(id) ||
            (enabled.has("dashboard") && id.startsWith("dashboard_")) ||
            (enabled.has("tasks") && id.startsWith("task_")) ||
            (enabled.has("scheduling") && id.startsWith("schedule_")) ||
            (isScheduledJob && ["job_memory_recall", "notification_send"].includes(id)),
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
          ? "This run belongs to a scheduled job with its own private history. Use job_memory_recall before answering whenever the task asks for novelty, non-repetition, continuity, or comparison with prior runs. If this job can create tasks or task lists, inspect the current open tasks and lists before writing. Treat matching source links or substantially equivalent titles and purposes as the same work: update the existing task instead of creating another. Never evade task_create's created=false result by rewording a duplicate. Use notification_send when the job prompt asks for a user alert, keeping the alert concise. Previous outputs are recorded automatically; never use another job or ordinary chat as this job's memory."
          : "";
      const providerInstructions =
        requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
          ? "This scheduled run uses local Ollama only."
          : modelProvider.capabilityInstructions;
      const chartInstructions =
        "For render_chart, pass ordered tabular data as columns plus aligned rows. Put the label or time axis first and numeric series after it.";
      return `You are ${serverConfig.appBranding.fullName}, a capable and concise assistant.

The user has enabled these capabilities for this run: ${enabled.join(", ") || "none"}. Only use tools that are enabled. ${scheduledJobInstructions} Use project search for this app's stack, calculator for arithmetic, Monty for isolated Python, web_fetch for a normal bounded URL request, and url_fetch when a specific public page needs browser-like request behavior. url_fetch is not internet search. When the user asks to add, pin, save, cache, or periodically refresh something on their dashboard, use dashboard_upsert_widget. Write a deterministic Monty program that returns one validated chart, metric, table, or text object. In that program call actual Mastra tools with await tool_call("tool_id", {input fields}), and declare exactly those tool IDs in capabilities. The saved program refreshes without an LLM. The dashboard runtime enforces cache TTL; do not add an early cache_get() return merely to implement caching. Use cache_get() only for incremental calculations that actually need the previous output. Set refreshIntervalSeconds only when the user explicitly asks for polling; a cache TTL alone refreshes on the first page load after expiry. Use dashboard_list before changing an existing widget, and dashboard_archive to archive or restore widgets and tabs. When the user asks for work on a time cadence, use schedule_create. Put only the recurring work in its prompt and include the timezone when known. When Code mode is enabled, workspace tools operate directly on the host filesystem and shell; do not read secrets or modify unrelated files unless explicitly asked. ${providerInstructions}

${chartInstructions}

${DEFAULT_WRITING_STYLE_INSTRUCTIONS}

Remember stable user preferences in working memory, but do not store secrets or sensitive credentials.`;
    },
    defaultOptions: ({ requestContext }) =>
      resolveRuntimeOptions(requestContext),
  });

  const codexAgent = serverConfig.codexAgentEnabled
    ? createCodexAgent(memory)
    : undefined;
  const observability = createObservability();

  const mastra = new Mastra({
    ...(observability ? { observability } : {}),
    agents: {
      chatAgent,
      ...(codexAgent ? { codexAgent } : {}),
    },
    tools: {
      search: searchTool,
      calculator: calculatorTool,
      monty: montyTool,
      render_chart: renderChartTool,
      web_fetch: dashboardWebFetchTool,
      url_fetch: urlFetchTool,
      ...(serverConfig.dashboard.sqlDatabaseUrl ? { sql_query: dashboardSqlTool } : {}),
      dashboard_upsert_widget: dashboardUpsertWidgetTool,
      dashboard_list: dashboardListTool,
      dashboard_archive: dashboardArchiveTool,
      task_list: taskListTool,
      task_list_lists: taskListListsTool,
      task_list_create: taskListCreateTool,
      task_list_update: taskListUpdateTool,
      task_list_delete: taskListDeleteTool,
      task_create: taskCreateTool,
      task_update: taskUpdateTool,
      task_delete: taskDeleteTool,
      schedule_create: scheduleCreateTool,
      schedule_list: scheduleListTool,
      schedule_parse: scheduleParseTool,
      job_memory_recall: jobMemoryRecallTool,
      notification_send: notificationSendTool,
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
      onFinish: async ({ outcome, schedule }) => {
        const stored = schedule as typeof schedule & {
          id: string;
          name?: string;
          resourceId?: string;
        };
        if (!stored.resourceId) return;
        await notifyResource(stored.resourceId, {
          title: stored.name || "Scheduled job complete",
          body: outcome === "succeeded" ? "Your scheduled work is ready." : `Scheduled run finished: ${outcome}.`,
          tag: `schedule-${stored.id}`,
          url: "/scheduled",
        });
      },
      onError: async ({ error, schedule }) => {
        const stored = schedule as typeof schedule & {
          id: string;
          name?: string;
          resourceId?: string;
        };
        if (!stored.resourceId) return;
        await notifyResource(stored.resourceId, {
          title: stored.name || "Scheduled job failed",
          body: error instanceof Error ? error.message.slice(0, 180) : "A scheduled run failed.",
          tag: `schedule-${stored.id}`,
          url: "/scheduled",
        });
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

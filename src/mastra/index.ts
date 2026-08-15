import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import type { Config as MastraConfig } from "@mastra/core/mastra";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

import { serverConfig } from "@/lib/config";
import {
  modelProvider,
  resolveBackgroundModel,
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";
import { hostWorkspace } from "@/mastra/host-workspace";
import { createCodexAgent } from "@/mastra/codex-agent";
import {
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import { notifyResource } from "@/lib/push-notifications";
import { createObservability } from "@/mastra/observability";
import { DEFAULT_WRITING_STYLE_INSTRUCTIONS } from "@/mastra/writing-style-instructions";
import { configuredMcpTools } from "@/mastra/mcp-tool-sources";
import {
  createToolRegistry,
  type LfpChatToolRegistryOverrides,
} from "@/mastra/tool-registry";
import { registerDashboardMastraTools } from "@/lib/dashboard-runtime";
import { OpenAiConversationStateProcessor } from "@/mastra/openai-conversation-state";

export type LfpChatMastraCustomization = {
  /** Keyed native Mastra tool overrides; existing keys update and new keys register. */
  configureTools?: LfpChatToolRegistryOverrides;
  /** Replace or extend any Chat Agent setting, including tools, model, memory, and workspace. */
  configureChatAgent?: (config: AgentConfig) => AgentConfig;
  /** Replace or extend any Mastra setting, including agents, workflows, tools, storage, and MCP. */
  configureMastra?: (config: MastraConfig) => MastraConfig;
};

function resolvedEnabledCapabilities(value: unknown): Set<string> {
  const enabled = new Set(normalizeEnabledToolIds(value));
  for (const [id, policy] of Object.entries(serverConfig.toolPolicyOverrides)) {
    if (policy.userConfigurable === true) continue;
    if (policy.enabled === false) enabled.delete(id);
    else if (policy.enabled === true) enabled.add(id);
  }
  return enabled;
}

function exactToolPolicy(id: string, enabled: Set<string>): boolean | undefined {
  const policy = serverConfig.toolPolicyOverrides[id];
  if (!policy) return undefined;
  return policy.userConfigurable === true
    ? enabled.has(id)
    : policy.enabled;
}

export function createLfpChatMastra(
  customization: LfpChatMastraCustomization = {},
) {
  const toolRegistry = createToolRegistry();
  toolRegistry.configureTools(Object.fromEntries(
    serverConfig.mcpToolSources.map((source) => [source.id, {
      title: source.title,
      description: source.description,
      hidden: source.hidden,
      enabled: source.enabled,
      userConfigurable: source.userConfigurable,
      tools: {},
    }]),
  ));
  for (const entry of toolRegistry.entries()) {
    const policy = serverConfig.toolPolicyOverrides[entry.id];
    if (!policy) continue;
    toolRegistry.configureTools({ [entry.id]: {
      ...(policy.enabled === undefined ? {} : { enabled: policy.enabled }),
      ...(policy.hidden === undefined ? {} : { hidden: policy.hidden }),
      ...(policy.userConfigurable === undefined ? {} : { userConfigurable: policy.userConfigurable }),
      ...(policy.availableToMonty === undefined
        ? {}
        : { availableToMonty: policy.availableToMonty ? Object.keys(entry.tools) : [] }),
    } });
  }
  if (customization.configureTools) {
    toolRegistry.configureTools(customization.configureTools);
  }
  registerDashboardMastraTools(toolRegistry.montyTools());
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
        agentManaged: false,
        useStateSignals: true,
        template: [
          "# User context",
          "- Name:",
          "- Preferences:",
          "- Current goals:",
          "- Important constraints:",
          "- Household access details (only when the user explicitly asks to remember them):",
        ].join("\n"),
      },
      observationalMemory: {
        enabled: true,
        model: resolveBackgroundModel(),
        // Keep observations isolated to a conversation. Working memory remains
        // resource-scoped so the compact user profile is still shared.
        scope: "thread",
        observation: {
          manageWorkingMemory: true,
        },
      },
    },
  });
  const openAiConversationState = new OpenAiConversationStateProcessor();

  const baseChatAgentConfig: AgentConfig = {
    id: "chatAgent",
    name: serverConfig.appBranding.fullName,
    description: "A concise, tool-capable assistant with persistent memory.",
    model: ({ requestContext }) => resolveRuntimeModel(requestContext),
    memory,
    inputProcessors: [openAiConversationState],
    outputProcessors: [openAiConversationState],
    errorProcessors: [openAiConversationState],
    tools: async ({ requestContext }) => {
      const enabled = resolvedEnabledCapabilities(requestContext.get(TOOLS_CONTEXT_KEY));
      if (!serverConfig.taskServiceConfigured) enabled.delete("tasks");
      const isScheduledJob = requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true;
      await configuredMcpTools(enabled, toolRegistry);
      const availableTools = {
        ...toolRegistry.resolve(enabled, {
          scheduled: isScheduledJob,
          taskServiceConfigured: serverConfig.taskServiceConfigured,
        }),
      };
      return Object.fromEntries(
        Object.entries(availableTools).filter(([id]) => {
          const policyDecision = exactToolPolicy(id, enabled);
          return policyDecision ?? true;
        }),
      );
    },
    workspace: ({ requestContext }) =>
      resolvedEnabledCapabilities(requestContext.get(TOOLS_CONTEXT_KEY)).has("code_mode")
        ? hostWorkspace
        : undefined,
    instructions: ({ requestContext }) => {
      const enabled = [...resolvedEnabledCapabilities(
        requestContext.get(TOOLS_CONTEXT_KEY),
      )].filter((id) => serverConfig.taskServiceConfigured || id !== "tasks");
      const scheduledJobInstructions =
        requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
          ? "This run belongs to a scheduled job with its own private history. Use job_memory_recall before answering whenever the task asks for novelty, non-repetition, continuity, or comparison with prior runs. If this job can create tasks or task lists, inspect the current open tasks and lists before writing. Treat matching source links or substantially equivalent titles and purposes as the same work: update the existing task instead of creating another. Never evade task_create's created=false result by rewording a duplicate. Use notification_send when the job prompt asks for a user alert, keeping the alert concise. Set its URL to the exact source or result the alert is about when available; use a relevant app page otherwise, and use /scheduled only for schedule-management alerts. Previous outputs are recorded automatically; never use another job or ordinary chat as this job's memory."
          : "";
      const providerInstructions =
        requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
          ? "This scheduled run uses local Ollama only."
          : modelProvider.capabilityInstructions;
      const chartInstructions =
        "For render_chart, pass ordered tabular data as columns plus aligned rows. Put the label or time axis first and numeric series after it.";
      return `You are ${serverConfig.appBranding.fullName}, a capable and concise assistant.

The user has enabled these optional capabilities for this run: ${enabled.join(", ") || "none"}. Monty, cache, dashboard orchestration, and hosted code_interpreter are mandatory framework capabilities and always available when supported by the provider. Only use other tools when they are enabled. ${scheduledJobInstructions} Use Monty for isolated Python, web_fetch for a normal bounded URL request, and url_fetch when a specific public page needs browser-like request behavior. url_fetch is not internet search. Create reusable data logic with dashboard_upsert_tool; saved tools may call declared built-in or saved tools, and each distinct deeply ordered input is cached automatically for its TTL. During a refresh or expired-cache recomputation, saved tool code receives previous with its prior same-input output, or None on its first run. Explicit cache deletes are soft deletes and get can opt into expired or deleted values. Create visible results with dashboard_upsert_widget only after the backing saved tool exists. A widget names exactly one saved tool, supplies fixed JSON input, and converts the returned data into one chart, metric, table, or text presentation. Widgets never fetch, call arbitrary tools, cache, or poll. Text presentations may use the validated css fields for fontWeight, fontStyle, and textAlign. Saved programs run without an LLM. Use compact dashboard_list output for discovery and request includeDefinitions only for a targeted edit. Use dashboard_archive to archive or restore, and dashboard_delete only when the user explicitly asks to permanently remove an archived item. Use notification_send only when the user explicitly asks for an alert. When the user asks for work on a time cadence, use schedule_create. Put only the recurring work in its prompt and include the timezone when known. When Code mode is enabled, workspace tools operate directly on the host filesystem and shell; do not read secrets or modify unrelated files unless explicitly asked. ${providerInstructions}

${chartInstructions}

${DEFAULT_WRITING_STYLE_INSTRUCTIONS}

Mastra observational memory maintains stable user preferences and household facts in PostgreSQL.
Ordinary query results, transaction rows, emails, attachments, and tool output are not user-profile
memory and must not be copied into working memory. Household access details such as garage, gate,
lockbox, door, or alarm codes may be retained only when the user explicitly asks. Never retain
account passwords, API keys, authentication or recovery tokens, private keys, payment card details,
or financial account credentials.`;
    },
    defaultOptions: ({ requestContext }) =>
      resolveRuntimeOptions(requestContext),
  };

  const chatAgentConfig =
    customization.configureChatAgent?.(baseChatAgentConfig) ??
    baseChatAgentConfig;

  const chatAgent = new Agent(chatAgentConfig);

  const codexAgent = serverConfig.codexAgentEnabled
    ? createCodexAgent(memory)
    : undefined;
  const observability = createObservability();

  const baseMastraConfig: MastraConfig = {
    ...(observability ? { observability } : {}),
    agents: {
      chatAgent,
      ...(codexAgent ? { codexAgent } : {}),
    },
    tools: Object.fromEntries(
      Object.entries(toolRegistry.mastraTools()).filter(([id]) =>
        serverConfig.taskServiceConfigured || !id.startsWith("task_"),
      ),
    ),
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
  };

  const mastraConfig =
    customization.configureMastra?.(baseMastraConfig) ?? baseMastraConfig;

  const mastra = new Mastra(mastraConfig);

  return {
    mastra,
    memory,
    toolRegistry,
    toolCatalog: toolRegistry.uiCatalog({
      taskServiceConfigured: serverConfig.taskServiceConfigured,
    }),
  };
}

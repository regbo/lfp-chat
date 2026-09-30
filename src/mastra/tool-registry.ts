import type { ToolsInput } from "@mastra/core/agent";
import type { Config as MastraConfig } from "@mastra/core/mastra";
import { webFetchTool } from "@mastra/core/tools";

import { defaultRegisteredTools, type ToolUiSettings } from "@/lib/tool-catalog";
import { jobMemoryRecallTool } from "@/mastra/job-memory-tool";
import { modelProvider } from "@/mastra/model-provider";
import { notificationSendTool } from "@/mastra/notification-tool";
import { scheduleParseTool } from "@/mastra/schedule-parser";
import { scheduleCreateTool, scheduleListTool } from "@/mastra/schedule-tools";
import {
  taskCreateTool,
  taskDeleteTool,
  taskListCreateTool,
  taskListDeleteTool,
  taskListListsTool,
  taskListTool,
  taskListUpdateTool,
  taskUpdateTool,
} from "@/mastra/task-tools";
import { montyTool } from "@/mastra/tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";
import { renderChartTool } from "@/mastra/chart-tool";

export type LfpChatToolRegistryEntry = ToolUiSettings & {
  id: string;
  title: string;
  description: string;
  /** Native Mastra tools; their descriptions, schemas, metadata, and types remain intact. */
  tools: ToolsInput;
  /** Restrict this group to scheduled/background runs. */
  scheduledOnly?: boolean;
  /** Omit this group from scheduled/background runs. */
  interactiveOnly?: boolean;
  /** The capability depends on the optional task service. */
  requiresTaskService?: boolean;
};

type NativeMastraTool = NonNullable<MastraConfig["tools"]>[string];

function providerTool(id: string): ToolsInput {
  const tool = modelProvider.tools[id];
  return tool ? { [id]: tool } : {};
}

function isNativeMastraTool(tool: ToolsInput[string]): tool is NativeMastraTool {
  return typeof (tool as { id?: unknown }).id === "string";
}

function toolDescription(tool: ToolsInput[string] | undefined) {
  const description = (tool as { description?: unknown } | undefined)?.description;
  return typeof description === "string" ? description : undefined;
}

const internalTools: ToolsInput = {
  monty: montyTool,
  web_fetch: webFetchTool,
};

export const defaultToolRegistry = {
  internal: {
    id: "internal",
    title: "Internal tools",
    description: "Framework tools used by every agent run.",
    hidden: true,
    enabled: true,
    userConfigurable: false,
    tools: internalTools,
  },
  render_chart: {
    ...defaultRegisteredTools.render_chart,
    tools: { render_chart: renderChartTool },
  },
  tasks: {
    ...defaultRegisteredTools.tasks,
    requiresTaskService: true,
    tools: {
      task_list: taskListTool,
      task_list_lists: taskListListsTool,
      task_list_create: taskListCreateTool,
      task_list_update: taskListUpdateTool,
      task_list_delete: taskListDeleteTool,
      task_create: taskCreateTool,
      task_update: taskUpdateTool,
      task_delete: taskDeleteTool,
    },
  },
  url_fetch: {
    ...defaultRegisteredTools.url_fetch,
    tools: { url_fetch: urlFetchTool },
  },
  scheduling: {
    ...defaultRegisteredTools.scheduling,
    tools: {
      schedule_create: scheduleCreateTool,
      schedule_list: scheduleListTool,
      schedule_parse: scheduleParseTool,
    },
  },
  web_search: {
    ...defaultRegisteredTools.web_search,
    interactiveOnly: true,
    tools: providerTool("web_search"),
  },
  image_generation: {
    ...defaultRegisteredTools.image_generation,
    interactiveOnly: true,
    tools: providerTool("image_generation"),
  },
  notifications: {
    ...defaultRegisteredTools.notifications,
    tools: { notification_send: notificationSendTool },
  },
  code_mode: {
    ...defaultRegisteredTools.code_mode,
    tools: {},
  },
  background: {
    id: "background",
    title: "Background tools",
    description: "Private continuity tools for scheduled work.",
    hidden: true,
    enabled: true,
    userConfigurable: false,
    scheduledOnly: true,
    tools: {
      job_memory_recall: jobMemoryRecallTool,
      notification_send: notificationSendTool,
    },
  },
  code_interpreter: {
    id: "code_interpreter",
    title: "Code interpreter",
    description: "Provider-hosted analysis for files and generated data.",
    hidden: true,
    enabled: true,
    userConfigurable: false,
    interactiveOnly: true,
    tools: providerTool("code_interpreter"),
  },
} as const satisfies Record<string, LfpChatToolRegistryEntry>;

export type DefaultRegisteredToolId = keyof typeof defaultToolRegistry;
export type DefaultRegisteredTool =
  (typeof defaultToolRegistry)[DefaultRegisteredToolId];
export type LfpChatToolRegistryOverride =
  | ToolsInput[string]
  | Partial<Omit<LfpChatToolRegistryEntry, "id">>;
export type LfpChatToolRegistryOverrides = Partial<
  Record<DefaultRegisteredToolId, LfpChatToolRegistryOverride>
> & Record<string, LfpChatToolRegistryOverride>;

function isToolRegistryEntryOverride(
  value: LfpChatToolRegistryOverride,
): value is Partial<Omit<LfpChatToolRegistryEntry, "id">> {
  return "tools" in value || "title" in value || "hidden" in value ||
    "enabled" in value || "userConfigurable" in value ||
    "scheduledOnly" in value || "interactiveOnly" in value ||
    "requiresTaskService" in value;
}

export class LfpChatToolRegistry {
  readonly #entries = new Map<string, LfpChatToolRegistryEntry>(
    Object.values(defaultToolRegistry).map((entry) => [
      entry.id,
      entry as LfpChatToolRegistryEntry,
    ]),
  );

  configureTools(overrides: LfpChatToolRegistryOverrides) {
    for (const [id, value] of Object.entries(overrides)) {
      if (!/^[a-z][a-z0-9_-]{0,62}$/.test(id)) {
        throw new Error(`Tool registry id must be a lowercase slug: ${id}`);
      }
      const current = this.#entries.get(id);
      const update: Partial<Omit<LfpChatToolRegistryEntry, "id">> =
        isToolRegistryEntryOverride(value)
        ? value
        : {
            tools: { [id]: value },
            description: toolDescription(value),
          };
      const tools = update.tools ?? current?.tools;
      if (!tools) throw new Error(`New tool registry entry ${id} requires a Mastra tool.`);
      const firstTool = Object.values(tools)[0];
      this.#entries.set(id, {
        id,
        title: update.title ?? current?.title ?? id,
        description:
          update.description ?? current?.description ?? toolDescription(firstTool) ?? id,
        hidden: update.hidden ?? current?.hidden ?? false,
        enabled: update.enabled ?? current?.enabled ?? true,
        userConfigurable:
          update.userConfigurable ?? current?.userConfigurable ?? true,
        tools,
        scheduledOnly: update.scheduledOnly ?? current?.scheduledOnly,
        interactiveOnly: update.interactiveOnly ?? current?.interactiveOnly,
        requiresTaskService:
          update.requiresTaskService ?? current?.requiresTaskService,
      });
    }
    return this;
  }

  entries() {
    return [...this.#entries.values()];
  }

  uiCatalog(options: { taskServiceConfigured?: boolean } = {}) {
    return this.entries()
      .filter((entry) =>
        !entry.hidden &&
        (!entry.requiresTaskService || options.taskServiceConfigured !== false),
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        hidden: entry.hidden,
        enabled: entry.enabled,
        userConfigurable: entry.userConfigurable,
      }));
  }

  allTools() {
    return Object.assign({}, ...this.entries().map((entry) => entry.tools)) as ToolsInput;
  }

  mastraTools() {
    return Object.fromEntries(
      Object.entries(this.allTools()).filter(([, tool]) => isNativeMastraTool(tool)),
    ) as Record<string, NativeMastraTool>;
  }

  resolve(enabled: ReadonlySet<string>, options: { scheduled: boolean; taskServiceConfigured: boolean }) {
    return Object.assign({}, ...this.entries().flatMap((entry) => {
      if (entry.scheduledOnly && !options.scheduled) return [];
      if (entry.interactiveOnly && options.scheduled) return [];
      if (entry.requiresTaskService && !options.taskServiceConfigured) return [];
      const active = entry.userConfigurable ? enabled.has(entry.id) : entry.enabled;
      return active ? [entry.tools] : [];
    })) as ToolsInput;
  }
}

export function createToolRegistry() {
  return new LfpChatToolRegistry();
}

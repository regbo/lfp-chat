import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { executeMontyCode } from "@/lib/monty-runtime";
import {
  dashboardCapabilitySchema,
  dashboardWidgetOutputSchema,
  type DashboardCapabilityName,
  type DashboardWidgetOutput,
} from "@/lib/dashboard-spec";

type DashboardExecutionOptions = {
  code: string;
  capabilities: DashboardCapabilityName[];
  resourceId: string;
  cachedOutput?: DashboardWidgetOutput;
  cacheAgeSeconds?: number;
  userToolCall?: (id: string, input: unknown, budget: DashboardCallBudget) => Promise<unknown>;
  budget?: DashboardCallBudget;
};

export type DashboardCallBudget = {
  depth: number;
  counter: { calls: number };
  stack: string[];
};

type AdaptedTool = {
  id: string;
  description: string;
  execute(input: unknown, resourceId: string): Promise<unknown>;
};

type MastraToolAdapterSource = {
  id: string;
  description: string;
  inputSchema?: unknown;
  execute?: unknown;
};

const globalForDashboardTools = globalThis as typeof globalThis & {
  lfpDashboardTools?: Map<string, AdaptedTool>;
};

function registry() {
  return (globalForDashboardTools.lfpDashboardTools ??= new Map());
}

export function fromMonty(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, item]) => [String(key), fromMonty(item)]),
    );
  }
  if (Array.isArray(value)) return value.map(fromMonty);
  return value;
}

export async function callRegisteredDashboardTool(id: string, input: unknown, resourceId: string) {
  const tool = registry().get(dashboardCapabilitySchema.parse(id));
  return tool ? { found: true as const, value: await tool.execute(fromMonty(input), resourceId) } : { found: false as const };
}

/**
 * Adapt real Mastra tools for deterministic Monty programs. Hosts decide which
 * tools are safe to expose; the widget itself must also persist an allowlist.
 */
export function registerDashboardMastraTools(
  tools: Record<string, MastraToolAdapterSource>,
) {
  for (const [key, tool] of Object.entries(tools)) {
    if (typeof tool.execute !== "function") continue;
    const execute = tool.execute as (input: unknown, context: unknown) => Promise<unknown>;
    const id = dashboardCapabilitySchema.parse(tool.id || key);
    registry().set(id, {
      id,
      description: tool.description,
      execute: async (input: unknown, resourceId: string) => {
        const parsed = tool.inputSchema instanceof z.ZodType
          ? await tool.inputSchema.parseAsync(input)
          : input;
        const requestContext = new RequestContext<Record<string, unknown>>();
        return execute(parsed, {
          requestContext,
          agent: { agentId: "dashboard-runtime", resourceId },
        } as never);
      },
    });
  }
}

export function dashboardCapabilityDescriptions() {
  return Array.from(registry().values())
    .map(({ id, description }) => ({ id, description }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

/** Run a persisted widget program with only its declared Mastra tools. */
export async function executeDashboardProgram(options: DashboardExecutionOptions) {
  const allowed = new Set(
    options.capabilities.map((capability) => dashboardCapabilitySchema.parse(capability)),
  );
  const toolCall = async (toolName: unknown, input: unknown) => {
    const id = dashboardCapabilitySchema.parse(toolName);
    if (!allowed.has(id)) {
      throw new Error(`Dashboard program did not declare the ${id} capability.`);
    }
    const registered = await callRegisteredDashboardTool(id, input, options.resourceId);
    if (registered.found) return registered.value;
    if (options.userToolCall) {
      return options.userToolCall(id, fromMonty(input), options.budget ?? {
        depth: 0,
        counter: { calls: 0 },
        stack: [],
      });
    }
    throw new Error(`Dashboard capability ${id} is not registered.`);
  };

  const startedAt = performance.now();
  const execution = await executeMontyCode(options.code, {
    inputs: { now: new Date().toISOString() },
    externalLookup: {
      tool_call: toolCall as (...args: never[]) => unknown,
      cache_get: (() => options.cachedOutput ?? null) as (...args: never[]) => unknown,
      cache_age_seconds: (() => options.cacheAgeSeconds ?? null) as (...args: never[]) => unknown,
    },
    maxDurationSecs: 8,
  });
  const output = dashboardWidgetOutputSchema.parse(fromMonty(execution.result));
  return {
    output,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    stdout: execution.stdout,
    stderr: execution.stderr,
  };
}

import { RequestContext } from "@mastra/core/request-context";
import { isValidationError } from "@mastra/core/tools";

import { executeMontyCode } from "@/lib/monty-runtime";
import {
  dashboardCapabilitySchema,
  dashboardWidgetOutputSchema,
} from "@/lib/dashboard-spec";

type DashboardExecutionOptions = {
  code: string;
  data: unknown;
  toolInput: unknown;
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
 * tools are safe to expose; each saved user tool persists its own allowlist.
 */
export function registerDashboardMastraTools(
  tools: Record<string, MastraToolAdapterSource>,
  options: { overwrite?: boolean } = {},
) {
  for (const [key, tool] of Object.entries(tools)) {
    if (typeof tool.execute !== "function") continue;
    const execute = tool.execute as (
      input: unknown,
      context: unknown,
    ) => Promise<unknown>;
    const id = dashboardCapabilitySchema.parse(tool.id || key);
    if (options.overwrite === false && registry().has(id)) continue;
    registry().set(id, {
      id,
      description: tool.description,
      execute: async (input: unknown, resourceId: string) => {
        const requestContext = new RequestContext<Record<string, unknown>>();
        const result = await execute(input, {
          requestContext,
          agent: { agentId: "dashboard-runtime", resourceId },
        } as never);
        if (isValidationError(result)) throw new Error(result.message);
        return result;
      },
    });
  }
}

export function dashboardCapabilityDescriptions() {
  return Array.from(registry().values())
    .map(({ id, description }) => ({ id, description }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

/** Convert one saved tool result into a validated dashboard presentation. */
export async function executeDashboardProgram(options: DashboardExecutionOptions) {
  const startedAt = performance.now();
  const execution = await executeMontyCode(options.code, {
    inputs: { data: options.data, input: options.toolInput, now: new Date().toISOString() },
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

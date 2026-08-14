import { executeMontyCode } from "@/lib/monty-runtime";
import { createHash } from "node:crypto";
import {
  callRegisteredDashboardTool,
  fromMonty,
  type DashboardCallBudget,
} from "@/lib/dashboard-runtime";
import { dashboardCapabilitySchema } from "@/lib/dashboard-spec";
import {
  cachedDashboardToolCall,
  getDashboardUserTool,
  recordDashboardUserToolRun,
} from "@/lib/dashboard-user-tool-store";
import { ensureDashboardCapabilities } from "@/mastra/dashboard-capabilities";

const MAX_TOOL_DEPTH = 6;
const MAX_TOOL_CALLS = 32;

function assertJsonValue(value: unknown) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("A user tool must return a JSON value.");
  return JSON.parse(encoded) as unknown;
}

export async function executeDashboardUserTool(
  resourceId: string,
  name: string,
  input: unknown,
  budget: DashboardCallBudget = { depth: 0, counter: { calls: 0 }, stack: [] },
  options: { force?: boolean } = {},
) {
  ensureDashboardCapabilities();
  if (budget.depth >= MAX_TOOL_DEPTH) throw new Error(`Dashboard tool nesting is limited to ${MAX_TOOL_DEPTH} levels.`);
  // Reserve one call exactly once. Child calls share this counter and reserve
  // their own slot, so cached, direct, and composed invocations account alike.
  const callsBefore = budget.counter.calls;
  const callsAfter = callsBefore + 1;
  if (callsAfter > MAX_TOOL_CALLS) throw new Error(`A dashboard run is limited to ${MAX_TOOL_CALLS} tool calls.`);
  budget.counter.calls = callsAfter;
  const tool = await getDashboardUserTool(resourceId, dashboardCapabilitySchema.parse(name));
  if (!tool) throw new Error(`Dashboard tool ${name} was not found or is archived.`);
  const signature = createHash("sha256").update(`${tool.name}\0${JSON.stringify(input)}`).digest("hex");
  if (budget.stack.includes(signature)) {
    throw new Error(`Dashboard tool ${tool.name} called itself again with the same input.`);
  }
  const nextBudget = {
    depth: budget.depth + 1,
    counter: budget.counter,
    stack: [...budget.stack, signature],
  };

  const startedAt = performance.now();
  try {
    const cached = await cachedDashboardToolCall({
      resourceId,
      tool,
      input,
      compute: async () => {
        const allowed = new Set(tool.capabilities);
        const toolCall = async (target: unknown, args: unknown) => {
          const id = dashboardCapabilitySchema.parse(target);
          if (!allowed.has(id)) throw new Error(`Tool ${tool.name} did not declare the ${id} dependency.`);
          const registered = await callRegisteredDashboardTool(id, args, resourceId);
          if (registered.found) return registered.value;
          return executeDashboardUserTool(resourceId, id, fromMonty(args), nextBudget, options);
        };
        const execution = await executeMontyCode(tool.code, {
          inputs: { args: input, now: new Date().toISOString() },
          externalLookup: { tool_call: toolCall as (...args: never[]) => unknown },
          maxDurationSecs: 8,
        });
        return assertJsonValue(fromMonty(execution.result));
      },
      force: options.force,
    });
    await recordDashboardUserToolRun(resourceId, tool.id, Math.round(performance.now() - startedAt));
    return cached.value;
  } catch (error) {
    await recordDashboardUserToolRun(
      resourceId,
      tool.id,
      Math.round(performance.now() - startedAt),
      error instanceof Error ? error.message : "Tool execution failed.",
    );
    throw error;
  }
}

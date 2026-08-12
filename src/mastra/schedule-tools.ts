import { createTool } from "@mastra/core/tools";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import {
  findCoveringSchedule,
  scheduleDedupeKey,
  scheduleRequestContext,
  SCHEDULE_TIMEZONE_CONTEXT_KEY,
} from "@/lib/schedules";
import {
  DEFAULT_CHAT_AGENT_ID,
  MODEL_CONTEXT_KEY,
  mostPowerfulModelSelection,
  normalizeModelSelection,
  reasoningEfforts,
  REASONING_CONTEXT_KEY,
} from "@/lib/model-catalog";
import {
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";
import {
  generateScheduleName,
  parseScheduleInput,
} from "@/mastra/schedule-parser";
import { getModelCatalog } from "@/mastra/model-provider";

const scheduleOutputSchema = z.object({
  created: z.boolean(),
  message: z.string(),
  schedule: z.record(z.string(), z.unknown()),
});

export const scheduleCreateTool = createTool({
  id: "schedule_create",
  description:
    "Create recurring work for this user from a plain-language schedule or cron expression. The job inherits the invoking model and reasoning by default. Set modelPreference to most_powerful when the user asks for the strongest or most powerful thinking model. If no time was specified, 09:00 is used in the user's timezone. This tool checks existing schedules for the same work before creating one, so never create a second schedule to change cadence; tell the user to edit the existing schedule instead.",
  inputSchema: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    prompt: z.string().trim().min(1).max(8_000).describe(
      "The self-contained instruction the agent should execute on every run, excluding cadence wording.",
    ),
    schedule: z.string().trim().min(1).max(300).optional().describe(
      "A natural recurrence such as every Tuesday at 9 AM, or a cron expression.",
    ),
    cron: z.string().trim().min(1).max(100).optional().describe(
      "Deprecated compatibility field for a cron expression. Prefer schedule.",
    ),
    timezone: z.string().trim().min(1).max(100).optional(),
    modelPreference: z.enum(["inherit", "most_powerful"]).optional().describe(
      "Use inherit unless the user asks for the most powerful or strongest thinking model.",
    ),
    modelId: z.string().trim().min(1).optional().describe(
      "An explicit provider/model id when the user names a specific model.",
    ),
    reasoningEffort: z.enum(reasoningEfforts).optional().describe(
      "An explicit reasoning effort requested for this scheduled job.",
    ),
    runImmediately: z.boolean().optional().describe(
      "Omit to use the server default, which runs the job once immediately. Set false only when the user asks to wait for the first scheduled time.",
    ),
  }),
  outputSchema: scheduleOutputSchema,
  execute: async (input, context) => {
    const mastra = context?.mastra;
    const agentId = context?.agent?.agentId;
    const resourceId = context?.agent?.resourceId;
    if (!mastra || !agentId || !resourceId) {
      throw new Error("Scheduling requires an agent run with a memory resource.");
    }

    const requestedTimezone =
      input.timezone ||
      (context.requestContext?.get(SCHEDULE_TIMEZONE_CONTEXT_KEY) as string | undefined) ||
      "UTC";
    const scheduleInput = input.schedule || input.cron;
    if (!scheduleInput) throw new Error("A plain-language schedule or cron expression is required.");
    const modelCatalog = await getModelCatalog();
    const inheritedModelSelection = normalizeModelSelection(modelCatalog, {
      agentId: DEFAULT_CHAT_AGENT_ID,
      modelId: context.requestContext?.get(MODEL_CONTEXT_KEY) as string | undefined,
      reasoningEffort: context.requestContext?.get(REASONING_CONTEXT_KEY) as
        | (typeof reasoningEfforts)[number]
        | undefined,
    });
    const preferredModelSelection =
      input.modelPreference === "most_powerful"
        ? mostPowerfulModelSelection(modelCatalog)
        : inheritedModelSelection;
    const jobModelSelection = normalizeModelSelection(modelCatalog, {
      ...preferredModelSelection,
      modelId: input.modelId || preferredModelSelection.modelId,
      reasoningEffort:
        input.reasoningEffort ?? preferredModelSelection.reasoningEffort,
    });
    const schedules = await mastra.schedules.list({ agentId, resourceId });
    const existing = findCoveringSchedule(schedules, {
      agentId,
      prompt: input.prompt,
      resourceId,
    });
    if (existing) {
      return {
        created: false,
        message: `An existing schedule already covers this work: ${"name" in existing && existing.name ? existing.name : existing.id}. Edit it in Scheduled instead of creating a duplicate.`,
        schedule: existing as unknown as Record<string, unknown>,
      };
    }
    const [parsedSchedule, scheduleName] = await Promise.all([
      parseScheduleInput(
        { schedule: scheduleInput, timezone: requestedTimezone },
        context.requestContext,
      ),
      input.name
        ? Promise.resolve(input.name)
        : generateScheduleName(input.prompt, context.requestContext),
    ]);
    const { cron, timezone } = parsedSchedule;

    const agent = mastra.getAgentById(agentId);
    const memory = await agent.getMemory({ requestContext: context.requestContext });
    if (!memory) throw new Error("The active agent does not have memory configured.");

    const threadId = `schedule-${randomUUID()}`;
    await memory.createThread({
      resourceId,
      threadId,
      title: `Scheduled: ${scheduleName}`,
      metadata: { schedule: true, createdBy: "schedule_create" },
    });

    const enabledToolIds = normalizeEnabledToolIds(
      context.requestContext?.get(TOOLS_CONTEXT_KEY),
    );
    const requestContext = scheduleRequestContext({
      enabledToolIds,
      modelId: jobModelSelection.modelId,
      reasoningEffort: jobModelSelection.reasoningEffort,
      timezone,
    });

    try {
      const schedule = await mastra.schedules.create({
        agentId,
        cron,
        timezone,
        prompt: input.prompt,
        resourceId,
        threadId,
        name: scheduleName,
        signalType: "system-reminder",
        ifActive: { behavior: "deliver" },
        ifIdle: { behavior: "wake", streamOptions: { requestContext } },
        metadata: {
          agentId,
          conversationThreadId: threadId,
          createdBy: "schedule_create",
          dedupeKey: scheduleDedupeKey({ agentId, prompt: input.prompt, resourceId }),
        },
      });
      const shouldRunImmediately =
        input.runImmediately ?? serverConfig.scheduleRunImmediately;
      let initialRunWarning: string | undefined;
      if (shouldRunImmediately) {
        try {
          await mastra.schedules.run(schedule.id);
        } catch (error) {
          initialRunWarning =
            error instanceof Error ? error.message : "unknown error";
        }
      }
      return {
        created: true,
        message: `Created ${scheduleName}: ${parsedSchedule.description} (${timezone}).${shouldRunImmediately ? initialRunWarning ? ` The schedule is active, but its initial run could not start: ${initialRunWarning}` : " Its initial run started immediately." : " Its first run will wait for the schedule."}`,
        schedule: schedule as unknown as Record<string, unknown>,
      };
    } catch (error) {
      await memory.deleteThread(threadId).catch(() => undefined);
      throw error;
    }
  },
});

export const scheduleListTool = createTool({
  id: "schedule_list",
  description:
    "List this user's existing recurring schedules. Use before discussing whether recurring work already exists.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    schedules: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async (_input, context) => {
    const mastra = context?.mastra;
    const agentId = context?.agent?.agentId;
    const resourceId = context?.agent?.resourceId;
    if (!mastra || !agentId || !resourceId) {
      throw new Error("Scheduling requires an agent run with a memory resource.");
    }
    return {
      schedules: (await mastra.schedules.list({ agentId, resourceId })) as unknown as Array<Record<string, unknown>>,
    };
  },
});

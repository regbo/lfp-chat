import { createTool } from "@mastra/core/tools";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  findCoveringSchedule,
  scheduleDedupeKey,
  scheduleRequestContext,
  SCHEDULE_TIMEZONE_CONTEXT_KEY,
} from "@/lib/schedules";
import {
  MODEL_CONTEXT_KEY,
  REASONING_CONTEXT_KEY,
} from "@/lib/model-catalog";
import {
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";
import { parseScheduleInput } from "@/mastra/schedule-parser";

const scheduleOutputSchema = z.object({
  created: z.boolean(),
  message: z.string(),
  schedule: z.record(z.string(), z.unknown()),
});

export const scheduleCreateTool = createTool({
  id: "schedule_create",
  description:
    "Create recurring work for this user from a plain-language schedule or cron expression. If no time was specified, 09:00 is used in the user's timezone. This tool checks existing schedules for the same work before creating one, so never create a second schedule to change cadence; tell the user to edit the existing schedule instead.",
  inputSchema: z.object({
    name: z.string().trim().min(1).max(80),
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
    const parsedSchedule = await parseScheduleInput(
      { schedule: scheduleInput, timezone: requestedTimezone },
      context.requestContext,
    );
    const { cron, timezone } = parsedSchedule;

    const agent = mastra.getAgentById(agentId);
    const memory = await agent.getMemory({ requestContext: context.requestContext });
    if (!memory) throw new Error("The active agent does not have memory configured.");

    const threadId = `schedule-${randomUUID()}`;
    await memory.createThread({
      resourceId,
      threadId,
      title: `Scheduled: ${input.name}`,
      metadata: { schedule: true, createdBy: "schedule_create" },
    });

    const enabledToolIds = normalizeEnabledToolIds(
      context.requestContext?.get(TOOLS_CONTEXT_KEY),
    );
    const requestContext = scheduleRequestContext({
      enabledToolIds,
      modelId: context.requestContext?.get(MODEL_CONTEXT_KEY) as string | undefined,
      reasoningEffort: context.requestContext?.get(REASONING_CONTEXT_KEY) as string | null | undefined,
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
        name: input.name,
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
      return {
        created: true,
        message: `Created ${input.name}: ${parsedSchedule.description} (${timezone}).`,
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

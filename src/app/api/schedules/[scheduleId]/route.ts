import { mastraClient } from "@/lib/mastra-client";
import { RequestContext } from "@mastra/core/request-context";
import type { AgentSchedule, ScheduleResponse } from "@mastra/client-js";
import {
  CODEX_CHAT_AGENT_ID,
  DEFAULT_CHAT_AGENT_ID,
  MODEL_CONTEXT_KEY,
  REASONING_CONTEXT_KEY,
  reasoningEfforts,
} from "@/lib/model-catalog";
import {
  findCoveringSchedule,
  scheduleDedupeKey,
  SCHEDULE_TIMEZONE_CONTEXT_KEY,
} from "@/lib/schedules";
import { z } from "zod";
import { parseScheduleInput } from "@/mastra/schedule-parser";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["pause", "resume", "run"]),
    resourceId: z.string().min(1),
  }),
  z.object({
    action: z.literal("update"),
    resourceId: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(8_000),
    schedule: z.string().trim().min(1).max(300).optional(),
    cron: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().trim().min(1).max(100),
    modelSelection: z.object({
      agentId: z.enum([DEFAULT_CHAT_AGENT_ID, CODEX_CHAT_AGENT_ID]),
      modelId: z.string().min(1),
      reasoningEffort: z.enum(reasoningEfforts).nullable(),
    }).optional(),
  }),
]);

type RouteContext = { params: Promise<{ scheduleId: string }> };

function isAgentSchedule(schedule: ScheduleResponse): schedule is AgentSchedule {
  return typeof schedule.agentId === "string";
}

async function getOwnedSchedule(scheduleId: string, resourceId: string) {
  const schedule = await mastraClient.getSchedule(scheduleId);
  if (!isAgentSchedule(schedule) || schedule.resourceId !== resourceId) {
    throw new Error("Schedule not found.");
  }
  return schedule;
}

export async function PATCH(request: Request, context: RouteContext) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid schedule change." },
      { status: 400 },
    );
  }
  const { scheduleId } = await context.params;

  try {
    const schedule = await getOwnedSchedule(scheduleId, parsed.data.resourceId);
    if (parsed.data.action === "update") {
      const recurrence = parsed.data.schedule || parsed.data.cron;
      if (!recurrence) {
        return Response.json({ error: "A plain-language schedule or cron expression is required." }, { status: 400 });
      }
      const listed = await mastraClient.listSchedules({
        agentId: schedule.agentId,
        resourceId: parsed.data.resourceId,
      });
      const existing = findCoveringSchedule(
        listed.schedules,
        {
          agentId: schedule.agentId,
          prompt: parsed.data.prompt,
          resourceId: parsed.data.resourceId,
        },
        schedule.id,
      );
      if (existing) {
        return Response.json(
          { error: `“${"name" in existing && existing.name ? existing.name : existing.id}” already covers this work.` },
          { status: 409 },
        );
      }
      if (
        parsed.data.modelSelection &&
        parsed.data.modelSelection.agentId !== schedule.agentId
      ) {
        return Response.json(
          { error: "A schedule’s agent cannot be changed after creation." },
          { status: 400 },
        );
      }
      const storedRequestContext = schedule.ifIdle?.streamOptions?.requestContext ?? {};
      const parserContext = new RequestContext();
      for (const [key, value] of Object.entries(storedRequestContext)) {
        parserContext.set(key, value);
      }
      if (
        parsed.data.modelSelection &&
        schedule.agentId === DEFAULT_CHAT_AGENT_ID
      ) {
        parserContext.set(
          MODEL_CONTEXT_KEY,
          parsed.data.modelSelection.modelId,
        );
        parserContext.set(
          REASONING_CONTEXT_KEY,
          parsed.data.modelSelection.reasoningEffort,
        );
      }
      const parsedSchedule = await parseScheduleInput(
        { schedule: recurrence, timezone: parsed.data.timezone },
        parserContext,
      );
      const result = await mastraClient.updateSchedule(scheduleId, {
        name: parsed.data.name,
        prompt: parsed.data.prompt,
        cron: parsedSchedule.cron,
        timezone: parsedSchedule.timezone,
        ifIdle: {
          ...schedule.ifIdle,
          streamOptions: {
            ...schedule.ifIdle?.streamOptions,
            requestContext: {
              ...schedule.ifIdle?.streamOptions?.requestContext,
              [SCHEDULE_TIMEZONE_CONTEXT_KEY]: parsedSchedule.timezone,
              ...(parsed.data.modelSelection &&
              schedule.agentId === DEFAULT_CHAT_AGENT_ID
                ? {
                    [MODEL_CONTEXT_KEY]: parsed.data.modelSelection.modelId,
                    [REASONING_CONTEXT_KEY]:
                      parsed.data.modelSelection.reasoningEffort,
                  }
                : {}),
            },
          },
        },
        metadata: {
          ...schedule.metadata,
          dedupeKey: scheduleDedupeKey({
            agentId: schedule.agentId,
            prompt: parsed.data.prompt,
            resourceId: parsed.data.resourceId,
          }),
        },
      });
      return Response.json({ result });
    }

    const result =
      parsed.data.action === "pause"
        ? await mastraClient.pauseSchedule(scheduleId)
        : parsed.data.action === "resume"
          ? await mastraClient.resumeSchedule(scheduleId)
          : await mastraClient.runSchedule(scheduleId);
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { scheduleId } = await context.params;
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }
  try {
    const schedule = await getOwnedSchedule(scheduleId, resourceId);
    const result = await mastraClient.deleteSchedule(scheduleId);
    if (schedule.threadId) {
      await mastraClient
        .deleteThread(schedule.threadId, { agentId: schedule.agentId })
        .catch(() => undefined);
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

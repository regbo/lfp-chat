import { mastraClient } from "@/lib/mastra-client";
import type { AgentSchedule, ScheduleResponse } from "@mastra/client-js";
import {
  findCoveringSchedule,
  scheduleDedupeKey,
  SCHEDULE_TIMEZONE_CONTEXT_KEY,
} from "@/lib/schedules";
import { z } from "zod";

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
    cron: z.string().trim().min(1).max(100),
    timezone: z.string().trim().min(1).max(100),
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
      const result = await mastraClient.updateSchedule(scheduleId, {
        name: parsed.data.name,
        prompt: parsed.data.prompt,
        cron: parsed.data.cron,
        timezone: parsed.data.timezone,
        ifIdle: {
          ...schedule.ifIdle,
          streamOptions: {
            ...schedule.ifIdle?.streamOptions,
            requestContext: {
              ...schedule.ifIdle?.streamOptions?.requestContext,
              [SCHEDULE_TIMEZONE_CONTEXT_KEY]: parsed.data.timezone,
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

import { mastraClient } from "@/lib/mastra-client";
import { serverConfig } from "@/lib/config";
import {
  DEFAULT_CHAT_AGENT_ID,
  MODEL_CONTEXT_KEY,
  normalizeModelSelection,
  REASONING_CONTEXT_KEY,
  reasoningEfforts,
} from "@/lib/model-catalog";
import { normalizeEnabledToolIds } from "@/lib/tool-catalog";
import {
  findCoveringSchedule,
  scheduleDedupeKey,
  scheduleRequestContext,
} from "@/lib/schedules";
import { randomUUID } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import type { AgentSchedule, ScheduleResponse } from "@mastra/client-js";
import { z } from "zod";
import {
  generateScheduleName,
  parseScheduleInput,
} from "@/mastra/schedule-parser";
import { getModelCatalog } from "@/mastra/model-provider";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

const createScheduleSchema = z.object({
  name: z.string().trim().max(80).optional(),
  prompt: z.string().trim().min(1).max(8_000),
  schedule: z.string().trim().min(1).max(300).optional(),
  cron: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().trim().min(1).max(100),
  resourceId: z.string().min(1),
  enabledToolIds: z.array(z.string()).optional(),
  modelSelection: z.object({
    agentId: z.literal(DEFAULT_CHAT_AGENT_ID),
    modelId: z.string().min(1),
    reasoningEffort: z.enum(reasoningEfforts).nullable(),
  }).nullable().optional(),
  runImmediately: z.boolean().optional(),
});

function isAgentSchedule(schedule: ScheduleResponse): schedule is AgentSchedule {
  return typeof schedule.agentId === "string";
}

async function nameUnlabeledSchedule(schedule: AgentSchedule) {
  if (schedule.name?.trim()) return schedule;
  const requestContext = new RequestContext();
  const storedRequestContext = schedule.ifIdle?.streamOptions?.requestContext ?? {};
  for (const [key, value] of Object.entries(storedRequestContext)) {
    requestContext.set(key, value);
  }
  const name = await generateScheduleName(schedule.prompt, requestContext);
  const updated = await mastraClient.updateSchedule(schedule.id, { name });
  return isAgentSchedule(updated) ? updated : schedule;
}

function scheduleModelSelection(
  schedule: AgentSchedule,
  catalog: Awaited<ReturnType<typeof getModelCatalog>>,
) {
  const requestContext = schedule.ifIdle?.streamOptions?.requestContext ?? {};
  return normalizeModelSelection(catalog, {
    agentId: schedule.agentId,
    modelId: requestContext[MODEL_CONTEXT_KEY] as string | undefined,
    reasoningEffort: requestContext[REASONING_CONTEXT_KEY] as
      | (typeof reasoningEfforts)[number]
      | undefined,
  });
}

export async function GET(request: Request) {
  const claimedResourceId = new URL(request.url).searchParams.get("resourceId");
  const resolved = await resolveUserScope(request.headers, claimedResourceId);
  if (!resolved.ok) return resolved.response;
  const { resourceId } = resolved.scope;

  try {
    const [modelCatalog, results] = await Promise.all([
      getModelCatalog(),
      Promise.all([
        mastraClient.listSchedules({
          agentId: DEFAULT_CHAT_AGENT_ID,
          resourceId,
        }),
      ]),
    ]);
    const schedules = await Promise.all(
      results
        .flatMap((result) => result.schedules ?? [])
        .filter(isAgentSchedule)
        .map(nameUnlabeledSchedule),
    );
    return Response.json({
      runImmediatelyDefault: serverConfig.scheduleRunImmediately,
      schedules: schedules.sort(
        (left, right) => left.nextFireAt - right.nextFireAt,
      ).map((schedule) => ({
        ...schedule,
        modelSelection: scheduleModelSelection(schedule, modelCatalog),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load schedules.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = createScheduleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid schedule." }, { status: 400 });
  }
  const resolved = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!resolved.ok) return resolved.response;
  const resourceId = resolved.scope.resourceId;

  const threadId = `schedule-${randomUUID()}`;
  let threadCreated = false;

  try {
    const agentId =
      parsed.data.modelSelection?.agentId ?? DEFAULT_CHAT_AGENT_ID;
    const existingSchedules = await mastraClient.listSchedules({
      agentId,
      resourceId,
    });
    const existing = findCoveringSchedule(existingSchedules.schedules, {
      agentId,
      prompt: parsed.data.prompt,
      resourceId,
    });
    if (existing) {
      return Response.json({ schedule: existing, existing: true });
    }

    const recurrence = parsed.data.schedule || parsed.data.cron;
    if (!recurrence) {
      return Response.json({ error: "A plain-language schedule or cron expression is required." }, { status: 400 });
    }
    const parserContext = new RequestContext();
    if (parsed.data.modelSelection && agentId === DEFAULT_CHAT_AGENT_ID) {
      parserContext.set(MODEL_CONTEXT_KEY, parsed.data.modelSelection.modelId);
      parserContext.set(REASONING_CONTEXT_KEY, parsed.data.modelSelection.reasoningEffort);
    }
    const [parsedSchedule, scheduleName] = await Promise.all([
      parseScheduleInput(
        { schedule: recurrence, timezone: parsed.data.timezone },
        parserContext,
      ),
      parsed.data.name
        ? Promise.resolve(parsed.data.name)
        : generateScheduleName(parsed.data.prompt, parserContext),
    ]);

    const title = `Scheduled: ${scheduleName}`;
    await mastraClient.createMemoryThread({
      agentId,
      resourceId,
      threadId,
      title,
      metadata: { schedule: true },
    });
    threadCreated = true;
    const enabledToolIds = normalizeEnabledToolIds(parsed.data.enabledToolIds);
    const requestContext = scheduleRequestContext({
      enabledToolIds,
      modelId:
        parsed.data.modelSelection && agentId === DEFAULT_CHAT_AGENT_ID
          ? parsed.data.modelSelection.modelId
          : undefined,
      reasoningEffort:
        parsed.data.modelSelection && agentId === DEFAULT_CHAT_AGENT_ID
          ? parsed.data.modelSelection.reasoningEffort
          : undefined,
      timezone: parsedSchedule.timezone,
    });
    const schedule = await mastraClient.createSchedule({
      agentId,
      prompt: parsed.data.prompt,
      cron: parsedSchedule.cron,
      timezone: parsedSchedule.timezone,
      resourceId,
      threadId,
      name: scheduleName,
      signalType: "system-reminder",
      ifActive: { behavior: "deliver" },
      ifIdle: {
        behavior: "wake",
        streamOptions: { requestContext },
      },
      metadata: {
        conversationThreadId: threadId,
        agentId,
        createdBy: "schedules_ui",
        dedupeKey: scheduleDedupeKey({
          agentId,
          prompt: parsed.data.prompt,
          resourceId,
        }),
      },
    });
    const shouldRunImmediately =
      parsed.data.runImmediately ?? serverConfig.scheduleRunImmediately;
    let initialRunWarning: string | undefined;
    if (shouldRunImmediately) {
      try {
        await mastraClient.runSchedule(schedule.id);
      } catch (error) {
        initialRunWarning =
          error instanceof Error ? error.message : "unknown error";
      }
    }
    return Response.json(
      {
        schedule,
        initialRunStarted: shouldRunImmediately && !initialRunWarning,
        initialRunWarning,
      },
      { status: 201 },
    );
  } catch (error) {
    if (threadCreated) {
      await mastraClient
        .deleteThread(threadId, {
          agentId:
            parsed.data.modelSelection?.agentId ?? DEFAULT_CHAT_AGENT_ID,
        })
        .catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Unable to create schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

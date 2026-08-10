import { mastraClient } from "@/lib/mastra-client";
import { serverConfig } from "@/lib/config";
import {
  CODEX_CHAT_AGENT_ID,
  DEFAULT_CHAT_AGENT_ID,
  MODEL_CONTEXT_KEY,
  REASONING_CONTEXT_KEY,
  reasoningEfforts,
} from "@/lib/model-catalog";
import { normalizeEnabledToolIds, TOOLS_CONTEXT_KEY } from "@/lib/tool-catalog";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";

const createScheduleSchema = z.object({
  name: z.string().trim().max(80).optional(),
  prompt: z.string().trim().min(1).max(8_000),
  cron: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(100),
  resourceId: z.string().min(1),
  enabledToolIds: z.array(z.string()).optional(),
  modelSelection: z.object({
    agentId: z.enum([DEFAULT_CHAT_AGENT_ID, CODEX_CHAT_AGENT_ID]),
    modelId: z.string().min(1),
    reasoningEffort: z.enum(reasoningEfforts).nullable(),
  }).nullable().optional(),
});

export async function GET(request: Request) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    const agentIds = serverConfig.codexAgentEnabled
      ? [DEFAULT_CHAT_AGENT_ID, CODEX_CHAT_AGENT_ID]
      : [DEFAULT_CHAT_AGENT_ID];
    const results = await Promise.all(
      agentIds.map((agentId) =>
        mastraClient.listSchedules({ agentId, resourceId }),
      ),
    );
    return Response.json({
      schedules: results
        .flatMap((result) => result.schedules ?? [])
        .sort((left, right) => left.nextFireAt - right.nextFireAt),
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

  const threadId = `schedule-${randomUUID()}`;
  let threadCreated = false;

  try {
    const agentId =
      parsed.data.modelSelection?.agentId ?? DEFAULT_CHAT_AGENT_ID;
    const title = `Scheduled: ${parsed.data.name || parsed.data.prompt.slice(0, 60)}`;
    await mastraClient.createMemoryThread({
      agentId,
      resourceId: parsed.data.resourceId,
      threadId,
      title,
      metadata: { schedule: true },
    });
    threadCreated = true;
    const enabledToolIds = normalizeEnabledToolIds(parsed.data.enabledToolIds);
    const requestContext: Record<string, unknown> = {
      [TOOLS_CONTEXT_KEY]: enabledToolIds,
    };
    if (
      parsed.data.modelSelection &&
      agentId === DEFAULT_CHAT_AGENT_ID
    ) {
      requestContext[MODEL_CONTEXT_KEY] = parsed.data.modelSelection.modelId;
      requestContext[REASONING_CONTEXT_KEY] =
        parsed.data.modelSelection.reasoningEffort;
    }
    const schedule = await mastraClient.createSchedule({
      agentId,
      prompt: parsed.data.prompt,
      cron: parsed.data.cron,
      timezone: parsed.data.timezone,
      resourceId: parsed.data.resourceId,
      threadId,
      name: parsed.data.name || undefined,
      signalType: "system-reminder",
      ifActive: { behavior: "deliver" },
      ifIdle: {
        behavior: "wake",
        streamOptions: { requestContext },
      },
      metadata: { conversationThreadId: threadId, agentId },
    });
    return Response.json({ schedule }, { status: 201 });
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

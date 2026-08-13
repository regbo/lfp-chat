import { mastraClient } from "@/lib/mastra-client";
import { truncateToolText } from "@/lib/tool-output";
import type { AgentSchedule, ScheduleResponse } from "@mastra/client-js";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scheduleId: string }> };

function isAgentSchedule(schedule: ScheduleResponse): schedule is AgentSchedule {
  return typeof schedule.agentId === "string";
}

function messageText(message: {
  content?: { parts?: Array<Record<string, unknown>> };
}) {
  return (message.content?.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

export async function GET(request: Request, context: RouteContext) {
  const claimedResourceId = new URL(request.url).searchParams.get("resourceId");
  const resolved = await resolveUserScope(request.headers, claimedResourceId);
  if (!resolved.ok) return resolved.response;
  const { resourceId } = resolved.scope;

  try {
    const { scheduleId } = await context.params;
    const schedule = await mastraClient.getSchedule(scheduleId);
    if (!isAgentSchedule(schedule) || schedule.resourceId !== resourceId) {
      return Response.json({ error: "Schedule not found." }, { status: 404 });
    }

    const triggersPromise = mastraClient.listScheduleTriggers(scheduleId, {
      limit: 50,
    });
    const messagesPromise = schedule.threadId
      ? mastraClient
          .getMemoryThread({ threadId: schedule.threadId, agentId: schedule.agentId })
          .listMessages({
            page: 0,
            perPage: 200,
            orderBy: { field: "createdAt", direction: "DESC" },
            includeSystemReminders: true,
          })
      : Promise.resolve({ messages: [] });
    const [{ triggers }, { messages }] = await Promise.all([
      triggersPromise,
      messagesPromise,
    ]);
    const assistantMessages = messages
      .filter((message) => message.role === "assistant")
      .map((message) => ({
        createdAt: new Date(message.createdAt).getTime(),
        text: messageText(message),
      }))
      .filter((message) => message.text)
      .sort((left, right) => left.createdAt - right.createdAt);

    const runs = triggers.map((trigger, index) => {
      const newerTriggerAt = index === 0 ? Number.POSITIVE_INFINITY : triggers[index - 1]!.actualFireAt;
      const outputs = assistantMessages.filter(
        (message) =>
          message.createdAt >= trigger.actualFireAt - 1_000 &&
          message.createdAt < newerTriggerAt,
      );
      return {
        ...trigger,
        output: outputs.length
          ? truncateToolText(outputs.map((message) => message.text).join("\n\n"), 20_000)
          : undefined,
        completedAt: outputs.at(-1)?.createdAt ?? trigger.run?.completedAt,
      };
    });

    return Response.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load schedule runs.";
    return Response.json({ error: message }, { status: 503 });
  }
}

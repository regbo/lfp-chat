import { mastraClient } from "@/lib/mastra-client";
import { z } from "zod";

export const runtime = "nodejs";

const actionSchema = z.object({ action: z.enum(["pause", "resume", "run"]) });

type RouteContext = { params: Promise<{ scheduleId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "action must be pause, resume, or run." }, { status: 400 });
  }
  const { scheduleId } = await context.params;

  try {
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

export async function DELETE(_request: Request, context: RouteContext) {
  const { scheduleId } = await context.params;
  try {
    return Response.json(await mastraClient.deleteSchedule(scheduleId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

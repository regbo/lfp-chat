import { mastraClient } from "@/lib/mastra-client";
import { z } from "zod";

export const runtime = "nodejs";

const createScheduleSchema = z.object({
  name: z.string().trim().max(80).optional(),
  prompt: z.string().trim().min(1).max(8_000),
  cron: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(100),
  threadId: z.string().min(1),
  resourceId: z.string().min(1),
});

export async function GET(request: Request) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    return Response.json(
      await mastraClient.listSchedules({ agentId: "chatAgent", resourceId }),
    );
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

  try {
    const schedule = await mastraClient.createSchedule({
      agentId: "chatAgent",
      ...parsed.data,
      name: parsed.data.name || undefined,
      signalType: "system-reminder",
      ifActive: { behavior: "deliver" },
      ifIdle: { behavior: "wake" },
    });
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

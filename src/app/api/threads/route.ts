import { mastraClient } from "@/lib/mastra-client";
import { isScheduledThread } from "@/lib/thread-state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    const result = await mastraClient.listMemoryThreads({
      resourceId,
      agentId: "chatAgent",
      perPage: 100,
      orderBy: { field: "updatedAt", direction: "DESC" },
    });
    // Schedule-owned threads are presented through the Scheduled view, where
    // their configuration and run history remain attached to the schedule.
    return Response.json({
      threads: result.threads.filter((thread) => !isScheduledThread(thread)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chats.";
    return Response.json({ error: message }, { status: 503 });
  }
}

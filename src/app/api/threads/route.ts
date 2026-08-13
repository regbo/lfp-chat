import { mastraClient } from "@/lib/mastra-client";
import { isScheduledThread } from "@/lib/thread-state";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const claimedResourceId = new URL(request.url).searchParams.get("resourceId");
  const resolved = await resolveUserScope(request.headers, claimedResourceId);
  if (!resolved.ok) return resolved.response;
  const { resourceId } = resolved.scope;

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

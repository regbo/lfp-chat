import { toAISdkMessages } from "@mastra/ai-sdk/ui";

import { mastraClient } from "@/lib/mastra-client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    const { threadId } = await params;
    const thread = mastraClient.getMemoryThread({
      threadId,
      agentId: "chatAgent",
    });
    const details = await thread.get();
    if (details.resourceId !== resourceId) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    // The current server route only accepts numeric pagination even though the
    // client type also exposes `false` as an unpaginated option.
    const result = await thread.listMessages({ perPage: 1_000 });

    return Response.json({
      messages: toAISdkMessages(result.messages, { version: "v6" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat.";
    return Response.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    await mastraClient.deleteThread(threadId, { agentId: "chatAgent" });
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete chat.";
    return Response.json({ error: message }, { status: 500 });
  }
}

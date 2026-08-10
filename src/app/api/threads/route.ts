import { mastraClient } from "@/lib/mastra-client";

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
    return Response.json({ threads: result.threads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chats.";
    return Response.json({ error: message }, { status: 503 });
  }
}

import { mastraClient } from "@/lib/mastra-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    const result = await mastraClient.listBackgroundTasks({
      resourceId,
      agentId: "chatAgent",
      orderBy: "createdAt",
      orderDirection: "desc",
      perPage: 20,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load background tasks.";
    return Response.json({ error: message }, { status: 503 });
  }
}

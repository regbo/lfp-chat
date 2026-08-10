import { mastraClient } from "@/lib/mastra-client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tools = await mastraClient.listTools();
    return Response.json({ tools });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tools.";
    return Response.json({ error: message }, { status: 503 });
  }
}

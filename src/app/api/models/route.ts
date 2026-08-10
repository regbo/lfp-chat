import { serverConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const response = await fetch(`${serverConfig.mastraApiUrl}/models`, {
      cache: "no-store",
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load models.";
    return Response.json({ error: message }, { status: 503 });
  }
}

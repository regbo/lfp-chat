import { serverConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      body: request.body,
      duplex: "half",
    };
    const upstream = await fetch(`${serverConfig.mastraApiUrl}/chat`, init);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mastra server is unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}

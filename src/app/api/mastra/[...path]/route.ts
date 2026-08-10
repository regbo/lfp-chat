import { serverConfig } from "@/lib/config";

export const runtime = "nodejs";

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}${sourceUrl.search}`,
    serverConfig.mastraApiUrl,
  );
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const response = await fetch(upstreamUrl, init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mastra is unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

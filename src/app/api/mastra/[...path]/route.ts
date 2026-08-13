import { serverConfig } from "@/lib/config";
import { resolveUserScope } from "@/lib/user-scope";

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
  let body: BodyInit | null | undefined;
  let claimedResourceId = sourceUrl.searchParams.get("resourceId");
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("content-type")?.includes("application/json")) {
      let payload: Record<string, unknown>;
      try {
        payload = await request.json() as Record<string, unknown>;
      } catch {
        return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
      }
      const memory = payload.memory;
      if (memory && typeof memory === "object") {
        const resource = (memory as Record<string, unknown>).resource;
        if (typeof resource === "string") claimedResourceId = resource;
      }
      if (!claimedResourceId && typeof payload.resourceId === "string") {
        claimedResourceId = payload.resourceId;
      }
      const resolved = await resolveUserScope(request.headers, claimedResourceId);
      if (!resolved.ok) return resolved.response;
      if (memory && typeof memory === "object") {
        payload.memory = {
          ...(memory as Record<string, unknown>),
          resource: resolved.scope.resourceId,
        };
      }
      if ("resourceId" in payload) payload.resourceId = resolved.scope.resourceId;
      body = JSON.stringify(payload);
    } else {
      const resolved = await resolveUserScope(request.headers, claimedResourceId);
      if (!resolved.ok) return resolved.response;
      body = request.body;
    }
  } else {
    const resolved = await resolveUserScope(request.headers, claimedResourceId);
    if (!resolved.ok) return resolved.response;
  }
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = body;
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

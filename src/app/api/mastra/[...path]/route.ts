import { serverConfig } from "@/lib/config";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const sourceUrl = new URL(request.url);
  const upstreamPath = [...path];
  const isAgentControllerRoute = path[0] === "agent-controller";
  const sessionResourceIndex =
    isAgentControllerRoute && path[2] === "sessions" && path.length > 3
      ? 3
      : -1;
  const isControllerCatalogRoute =
    isAgentControllerRoute &&
    (path.length === 1 ||
      (path.length === 3 && ["modes", "models"].includes(path[2])));
  const isControllerSessionCreate =
    isAgentControllerRoute &&
    path.length === 3 &&
    path[2] === "sessions" &&
    request.method === "POST";
  if (
    isAgentControllerRoute &&
    sessionResourceIndex < 0 &&
    !isControllerCatalogRoute &&
    !isControllerSessionCreate
  ) {
    return Response.json({ error: "Unsupported controller route." }, { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  let body: BodyInit | null | undefined;
  let claimedResourceId =
    sessionResourceIndex >= 0
      ? path[sessionResourceIndex]
      : sourceUrl.searchParams.get("resourceId");
  let payload: Record<string, unknown> | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("content-type")?.includes("application/json")) {
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
    } else {
      body = request.body;
    }
  }

  if (!isControllerCatalogRoute) {
    const resolved = await resolveUserScope(request.headers, claimedResourceId);
    if (!resolved.ok) return resolved.response;
    if (sessionResourceIndex >= 0) {
      upstreamPath[sessionResourceIndex] = resolved.scope.resourceId;
    }
    if (payload) {
      const memory = payload.memory;
      if (memory && typeof memory === "object") {
        payload.memory = {
          ...(memory as Record<string, unknown>),
          resource: resolved.scope.resourceId,
        };
      }
      if ("resourceId" in payload) payload.resourceId = resolved.scope.resourceId;
    }
  }
  if (payload) {
    body = JSON.stringify(payload);
  }

  const upstreamUrl = new URL(
    `/api/${upstreamPath.map(encodeURIComponent).join("/")}${sourceUrl.search}`,
    serverConfig.mastraApiUrl,
  );
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    signal: request.signal,
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

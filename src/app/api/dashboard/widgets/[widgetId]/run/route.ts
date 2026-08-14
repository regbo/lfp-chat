import { serverConfig } from "@/lib/config";
import { resolveUserScope } from "@/lib/user-scope";

export async function POST(
  request: Request,
  context: { params: Promise<{ widgetId: string }> },
) {
  const body = await request.json().catch(() => ({})) as { resourceId?: string; force?: boolean };
  const scope = await resolveUserScope(request.headers, body.resourceId);
  if (!scope.ok) return scope.response;
  try {
    const { widgetId } = await context.params;
    const upstream = await fetch(
      `${serverConfig.mastraApiUrl}/dashboard/widgets/${encodeURIComponent(widgetId)}/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: scope.scope.resourceId, force: body.force ?? false }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not refresh the widget." },
      { status: 500 },
    );
  }
}

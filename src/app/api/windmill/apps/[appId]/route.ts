import { findWindmillEmbedView, windmillGuestAppUrl } from "@/host/windmill-embed";
import { resolveUserScope } from "@/lib/user-scope";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/windmill/apps/[appId]">,
) {
  const scope = await resolveUserScope(request.headers);
  if (!scope.ok) return scope.response;
  const { appId } = await params;
  const view = findWindmillEmbedView(appId);
  if (!view) return Response.json({ error: "Windmill app not found." }, { status: 404 });
  try {
    const target = await windmillGuestAppUrl(view, scope.scope);
    return new Response(null, {
      status: 307,
      headers: {
        "Cache-Control": "private, no-store",
        Location: target.toString(),
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not open the Windmill app." },
      { status: 502 },
    );
  }
}

import { listDashboard } from "@/lib/dashboard-store";
import { resolveUserScope } from "@/lib/user-scope";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = await resolveUserScope(request.headers, params.get("resourceId"));
  if (!scope.ok) return scope.response;
  try {
    const state = await listDashboard(scope.scope.resourceId, {
      includeArchived: params.get("includeArchived") === "true",
    });
    return Response.json(
      params.get("summary") === "true"
        ? { hasDashboard: state.hasDashboard, archivedItemCount: state.archivedItemCount }
        : state,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load the dashboard." },
      { status: 500 },
    );
  }
}

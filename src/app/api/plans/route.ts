import { planWorkspaceForResource } from "@/mastra/host-workspace";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim();
  const resolved = await resolveUserScope(
    request.headers,
    url.searchParams.get("resourceId"),
  );
  if (!resolved.ok) return resolved.response;
  if (!path || !path.toLowerCase().endsWith(".md")) {
    return Response.json({ error: "A markdown plan path is required." }, { status: 400 });
  }
  try {
    const filesystem = planWorkspaceForResource(resolved.scope.resourceId).filesystem;
    if (!filesystem) throw new Error("Plan workspace filesystem is unavailable.");
    const content = await filesystem.readFile(path, { encoding: "utf-8" });
    const plan = content.toString();
    const title = plan.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Review the plan";
    return Response.json({ path, title, plan });
  } catch {
    return Response.json({ error: "The submitted plan could not be read." }, { status: 404 });
  }
}

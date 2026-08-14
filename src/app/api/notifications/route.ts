import { claimBrowserNotifications } from "@/lib/push-notifications";
import { resolveUserScope } from "@/lib/user-scope";

export async function GET(request: Request) {
  const requestedResourceId = new URL(request.url).searchParams.get("resourceId") ?? "";
  const resolved = await resolveUserScope(request.headers, requestedResourceId);
  if (!resolved.ok) return resolved.response;
  return Response.json({
    notifications: await claimBrowserNotifications(resolved.scope.resourceId),
  });
}

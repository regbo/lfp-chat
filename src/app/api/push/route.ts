import { z } from "zod";

import {
  pushNotificationConfig,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push-notifications";
import { resolveUserScope } from "@/lib/user-scope";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function GET() {
  return Response.json(pushNotificationConfig());
}

export async function POST(request: Request) {
  const parsed = z.object({
    resourceId: z.string().min(1),
    subscription: subscriptionSchema,
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const resolved = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!resolved.ok) return resolved.response;
  try {
    await savePushSubscription(resolved.scope.resourceId, parsed.data.subscription);
    return Response.json({ subscribed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not enable notifications." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const parsed = z.object({
    endpoint: z.url(),
    resourceId: z.string().min(1),
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const resolved = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!resolved.ok) return resolved.response;
  await removePushSubscription(parsed.data.endpoint, resolved.scope.resourceId);
  return new Response(null, { status: 204 });
}

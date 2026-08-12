import { z } from "zod";

import {
  pushNotificationConfig,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push-notifications";

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
  try {
    await savePushSubscription(parsed.data.resourceId, parsed.data.subscription);
    return Response.json({ subscribed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not enable notifications." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const parsed = z.object({ endpoint: z.url() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  await removePushSubscription(parsed.data.endpoint);
  return new Response(null, { status: 204 });
}

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { notifyResource, pushNotificationConfig } from "@/lib/push-notifications";

export const notificationSendTool = createTool({
  id: "notification_send",
  description:
    "Notify the current user. Delivery uses registered PWA devices first and queues a browser notification when push delivery is unavailable. Keep alerts concise and do not include secrets or full tool output.",
  inputSchema: z.object({
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(240),
    url: z.string().trim().max(500).default("/scheduled").describe(
      "An app-relative URL to open when the notification is tapped.",
    ),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    configured: z.boolean(),
    devices: z.number().int().nonnegative(),
    channel: z.enum(["push", "browser"]),
  }),
  execute: async ({ body, title, url }, context) => {
    const resourceId = context?.agent?.resourceId;
    if (!resourceId) throw new Error("Notifications require a user-scoped agent run.");
    const configured = pushNotificationConfig().enabled;
    const delivery = await notifyResource(resourceId, { title, body, url });
    const channel: "push" | "browser" = delivery.devices > 0 ? "push" : "browser";
    return {
      sent: delivery.devices > 0 || delivery.browserFallbackQueued,
      configured,
      devices: delivery.devices,
      channel,
    };
  },
});

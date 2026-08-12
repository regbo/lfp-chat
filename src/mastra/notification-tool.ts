import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { notifyResource, pushNotificationConfig } from "@/lib/push-notifications";

export const notificationSendTool = createTool({
  id: "notification_send",
  description:
    "Send a Web Push notification to the current user's registered PWA devices. Use from a scheduled job when the result needs a concise, timely alert. Do not include secrets or the full job output.",
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
  }),
  execute: async ({ body, title, url }, context) => {
    const resourceId = context?.agent?.resourceId;
    if (!resourceId) throw new Error("Notifications require a user-scoped agent run.");
    const configured = pushNotificationConfig().enabled;
    if (!configured) return { sent: false, configured: false, devices: 0 };
    const devices = await notifyResource(resourceId, { title, body, url });
    return { sent: devices > 0, configured: true, devices };
  },
});

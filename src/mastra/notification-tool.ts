import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { notifyResource, pushNotificationConfig } from "@/lib/push-notifications";

export const notificationTargetSchema = z.string().trim().min(1).max(2_000).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Use an app path beginning with / or an absolute HTTP(S) URL.").default("/");

export const notificationSendTool = createTool({
  id: "notification_send",
  description:
    "Notify the current user and link directly to the content the alert is about. Delivery uses registered PWA devices first and queues a browser notification when push delivery is unavailable. Keep alerts concise and do not include secrets or full tool output.",
  inputSchema: z.object({
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(240),
    url: notificationTargetSchema.describe(
      "Optional destination opened when tapped; it defaults to the home view. Use the specific source or result URL when one exists. App paths such as /tasks and absolute HTTP(S) URLs are supported. Use /scheduled only when the alert is specifically about managing its schedule.",
    ),
  }),
  inputExamples: [
    { input: { title: "New school email", body: "A permission form is due Friday.", url: "/search" } },
    { input: { title: "Price dropped", body: "The tracked item is now $49.", url: "https://example.com/item" } },
  ],
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

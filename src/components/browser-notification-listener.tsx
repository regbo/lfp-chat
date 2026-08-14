"use client";

import { useEffect } from "react";

import {
  BROWSER_NOTIFICATIONS_CHANGED_EVENT,
  browserNotificationsEnabled,
} from "@/lib/browser-notifications";

type PendingBrowserNotification = {
  id: number;
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export function BrowserNotificationListener({ resourceId }: { resourceId: string }) {
  useEffect(() => {
    let stopped = false;
    let polling = false;

    const poll = async () => {
      if (polling || stopped || !browserNotificationsEnabled()) return;
      polling = true;
      try {
        const query = new URLSearchParams({ resourceId });
        const response = await fetch(`/api/notifications?${query}`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const payload = await response.json() as { notifications?: PendingBrowserNotification[] };
        for (const item of payload.notifications ?? []) {
          const notification = new Notification(item.title, {
            body: item.body,
            icon: "/icon-192.png?v=4",
            tag: item.tag,
          });
          notification.onclick = () => {
            window.focus();
            window.location.assign(item.url);
            notification.close();
          };
        }
      } finally {
        polling = false;
      }
    };

    const pollWhenVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 10_000);
    window.addEventListener(BROWSER_NOTIFICATIONS_CHANGED_EVENT, poll);
    document.addEventListener("visibilitychange", pollWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener(BROWSER_NOTIFICATIONS_CHANGED_EVENT, poll);
      document.removeEventListener("visibilitychange", pollWhenVisible);
    };
  }, [resourceId]);

  return null;
}

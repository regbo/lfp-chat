export const BROWSER_NOTIFICATIONS_CHANGED_EVENT = "lfp-browser-notifications-changed";

const enabledKey = "lfp-browser-notifications-enabled";

export function browserNotificationsEnabled() {
  return typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    window.localStorage.getItem(enabledKey) !== "false";
}

export function setBrowserNotificationsEnabled(enabled: boolean) {
  window.localStorage.setItem(enabledKey, String(enabled));
  window.dispatchEvent(new Event(BROWSER_NOTIFICATIONS_CHANGED_EVENT));
}

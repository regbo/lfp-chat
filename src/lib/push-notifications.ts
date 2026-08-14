import { Pool } from "pg";
import webPush, { type PushSubscription } from "web-push";

import { serverConfig } from "@/lib/config";

const globalForPush = globalThis as typeof globalThis & {
  lfpPushPool?: Pool;
  lfpPushReady?: Promise<void>;
};

const pushConfigured = Boolean(
  serverConfig.webPushPublicKey && serverConfig.webPushPrivateKey,
);

if (pushConfigured) {
  webPush.setVapidDetails(
    serverConfig.webPushSubject,
    serverConfig.webPushPublicKey!,
    serverConfig.webPushPrivateKey!,
  );
}

function pool() {
  return globalForPush.lfpPushPool ??= new Pool({
    connectionString: serverConfig.databaseUrl,
    max: 3,
  });
}

async function ready() {
  globalForPush.lfpPushReady ??= pool().query(`
    CREATE TABLE IF NOT EXISTS lfp_push_subscriptions (
      endpoint text PRIMARY KEY,
      resource_id text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lfp_push_subscriptions_resource_idx
      ON lfp_push_subscriptions (resource_id);
    CREATE TABLE IF NOT EXISTS lfp_browser_notifications (
      id bigserial PRIMARY KEY,
      resource_id text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      url text NOT NULL DEFAULT '/',
      tag text,
      created_at timestamptz NOT NULL DEFAULT now(),
      claimed_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS lfp_browser_notifications_pending_idx
      ON lfp_browser_notifications (resource_id, id) WHERE claimed_at IS NULL;
  `).then(() => undefined);
  return globalForPush.lfpPushReady;
}

export function pushNotificationConfig() {
  return {
    enabled: pushConfigured,
    publicKey: pushConfigured ? serverConfig.webPushPublicKey : undefined,
  };
}

export async function savePushSubscription(
  resourceId: string,
  subscription: PushSubscription,
) {
  if (!pushConfigured) throw new Error("Web Push is not configured.");
  await ready();
  await pool().query(
    `INSERT INTO lfp_push_subscriptions (endpoint, resource_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       resource_id = EXCLUDED.resource_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       updated_at = now()`,
    [
      subscription.endpoint,
      resourceId,
      subscription.keys.p256dh,
      subscription.keys.auth,
    ],
  );
}

export async function removePushSubscription(endpoint: string, resourceId?: string) {
  await ready();
  await pool().query(
    resourceId
      ? "DELETE FROM lfp_push_subscriptions WHERE endpoint = $1 AND resource_id = $2"
      : "DELETE FROM lfp_push_subscriptions WHERE endpoint = $1",
    resourceId ? [endpoint, resourceId] : [endpoint],
  );
}

export async function notifyResource(
  resourceId: string,
  notification: { title: string; body: string; url?: string; tag?: string },
) {
  await ready();
  const result = pushConfigured ? await pool().query<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    "SELECT endpoint, p256dh, auth FROM lfp_push_subscriptions WHERE resource_id = $1",
    [resourceId],
  ) : { rows: [] };
  const deliveries = await Promise.all(result.rows.map(async (row) => {
    try {
      await webPush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(notification),
      );
      return true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await removePushSubscription(row.endpoint);
      }
      return false;
    }
  }));
  const devices = deliveries.filter(Boolean).length;
  if (devices === 0) {
    await pool().query(
      `INSERT INTO lfp_browser_notifications (resource_id, title, body, url, tag)
       VALUES ($1, $2, $3, $4, $5)`,
      [resourceId, notification.title, notification.body, notification.url ?? "/", notification.tag ?? null],
    );
  }
  return { devices, browserFallbackQueued: devices === 0 };
}

export async function claimBrowserNotifications(resourceId: string) {
  await ready();
  const result = await pool().query<{
    id: string;
    title: string;
    body: string;
    url: string;
    tag: string | null;
  }>(
    `WITH pending AS (
       SELECT id FROM lfp_browser_notifications
       WHERE resource_id = $1 AND claimed_at IS NULL
         AND created_at > now() - interval '24 hours'
       ORDER BY id LIMIT 20
       FOR UPDATE SKIP LOCKED
     )
     UPDATE lfp_browser_notifications notification
     SET claimed_at = now()
     FROM pending
     WHERE notification.id = pending.id
     RETURNING notification.id, notification.title, notification.body,
       notification.url, notification.tag`,
    [resourceId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    body: row.body,
    url: row.url,
    ...(row.tag ? { tag: row.tag } : {}),
  }));
}

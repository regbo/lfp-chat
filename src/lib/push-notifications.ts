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

export async function removePushSubscription(endpoint: string) {
  await ready();
  await pool().query("DELETE FROM lfp_push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export async function notifyResource(
  resourceId: string,
  notification: { title: string; body: string; url?: string; tag?: string },
) {
  if (!pushConfigured) return 0;
  await ready();
  const result = await pool().query<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    "SELECT endpoint, p256dh, auth FROM lfp_push_subscriptions WHERE resource_id = $1",
    [resourceId],
  );
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
  return deliveries.filter(Boolean).length;
}

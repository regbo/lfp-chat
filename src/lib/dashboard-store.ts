import { createHash, randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { serverConfig } from "@/lib/config";
import { listDashboardUserTools } from "@/lib/dashboard-user-tool-store";
import {
  dashboardCapabilitySchema,
  dashboardWidgetDraftSchema,
  dashboardWidgetOutputSchema,
  type DashboardState,
  type DashboardTab,
  type DashboardWidget,
  type DashboardWidgetDraft,
} from "@/lib/dashboard-spec";

type DashboardTabRow = {
  id: string;
  name: string;
  position: number;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type DashboardWidgetRow = {
  id: string;
  tab_id: string;
  title: string;
  description: string | null;
  code: string;
  capabilities: string[];
  cache_ttl_seconds: number;
  refresh_interval_seconds: number | null;
  lazy: boolean;
  position: number;
  cached_output: unknown;
  cache_expires_at: Date | string | null;
  last_run_at: Date | string | null;
  last_duration_ms: number | null;
  last_error: string | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const globalForDashboard = globalThis as typeof globalThis & {
  lfpDashboardPool?: Pool;
  lfpDashboardReady?: Promise<void>;
};

function pool() {
  return (globalForDashboard.lfpDashboardPool ??= new Pool({
    connectionString: serverConfig.databaseUrl,
    max: 4,
  }));
}

async function ready() {
  globalForDashboard.lfpDashboardReady ??= pool().query(`
    CREATE TABLE IF NOT EXISTS lfp_dashboard_tabs (
      id text PRIMARY KEY,
      resource_id text NOT NULL,
      name text NOT NULL,
      position integer NOT NULL DEFAULT 0,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lfp_dashboard_tabs_resource_idx
      ON lfp_dashboard_tabs (resource_id, position, created_at);

    CREATE TABLE IF NOT EXISTS lfp_dashboard_widgets (
      id text PRIMARY KEY,
      resource_id text NOT NULL,
      tab_id text NOT NULL REFERENCES lfp_dashboard_tabs(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      code text NOT NULL,
      capabilities text[] NOT NULL DEFAULT '{}',
      cache_ttl_seconds integer NOT NULL DEFAULT 300,
      refresh_interval_seconds integer,
      lazy boolean NOT NULL DEFAULT false,
      position integer NOT NULL DEFAULT 0,
      cached_output jsonb,
      cache_expires_at timestamptz,
      last_run_at timestamptz,
      last_duration_ms integer,
      last_error text,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lfp_dashboard_widgets_resource_idx
      ON lfp_dashboard_widgets (resource_id, tab_id, position, created_at);
  `).then(() => undefined);
  return globalForDashboard.lfpDashboardReady;
}

function iso(value: Date | string | null) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function widgetFromRow(row: DashboardWidgetRow): DashboardWidget {
  const output = row.cached_output
    ? dashboardWidgetOutputSchema.safeParse(row.cached_output)
    : undefined;
  return {
    id: row.id,
    tabId: row.tab_id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    code: row.code,
    capabilities: row.capabilities.map((value) => dashboardCapabilitySchema.parse(value)),
    cacheTtlSeconds: row.cache_ttl_seconds,
    ...(row.refresh_interval_seconds
      ? { refreshIntervalSeconds: row.refresh_interval_seconds }
      : {}),
    lazy: row.lazy,
    position: row.position,
    ...(output?.success ? { output: output.data } : {}),
    ...(iso(row.cache_expires_at) ? { cacheExpiresAt: iso(row.cache_expires_at) } : {}),
    ...(iso(row.last_run_at) ? { lastRunAt: iso(row.last_run_at) } : {}),
    ...(row.last_duration_ms !== null ? { lastDurationMs: row.last_duration_ms } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(iso(row.archived_at) ? { archivedAt: iso(row.archived_at) } : {}),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function tabFromRow(row: DashboardTabRow, widgets: DashboardWidget[]): DashboardTab {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    ...(iso(row.archived_at) ? { archivedAt: iso(row.archived_at) } : {}),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    widgets,
  };
}

export async function dashboardExists(resourceId: string) {
  await ready();
  const [result, tools] = await Promise.all([pool().query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM lfp_dashboard_widgets WHERE resource_id = $1) AS exists",
    [resourceId],
  ), listDashboardUserTools(resourceId, true)]);
  return (result.rows[0]?.exists ?? false) || tools.length > 0;
}

export async function listDashboard(
  resourceId: string,
  options: { includeArchived?: boolean } = {},
): Promise<DashboardState> {
  await ready();
  const includeArchived = options.includeArchived ?? false;
  const [tabsResult, widgetsResult, archiveResult, tools, exists] = await Promise.all([
    pool().query<DashboardTabRow>(
      `SELECT id, name, position, archived_at, created_at, updated_at
       FROM lfp_dashboard_tabs
       WHERE resource_id = $1 AND ($2 OR archived_at IS NULL)
       ORDER BY position, created_at`,
      [resourceId, includeArchived],
    ),
    pool().query<DashboardWidgetRow>(
      `SELECT id, tab_id, title, description, code, capabilities,
              cache_ttl_seconds, refresh_interval_seconds, lazy, position,
              cached_output, cache_expires_at, last_run_at, last_duration_ms,
              last_error, archived_at, created_at, updated_at
       FROM lfp_dashboard_widgets
       WHERE resource_id = $1 AND ($2 OR archived_at IS NULL)
       ORDER BY position, created_at`,
      [resourceId, includeArchived],
    ),
    pool().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM lfp_dashboard_widgets
       WHERE resource_id = $1 AND archived_at IS NOT NULL`,
      [resourceId],
    ),
    listDashboardUserTools(resourceId, includeArchived),
    dashboardExists(resourceId),
  ]);
  const widgets = widgetsResult.rows.map(widgetFromRow);
  return {
    tabs: tabsResult.rows.map((tab) =>
      tabFromRow(tab, widgets.filter((widget) => widget.tabId === tab.id)),
    ),
    tools,
    archivedWidgetCount: archiveResult.rows[0]?.count ?? 0,
    archivedToolCount: tools.filter((tool) => tool.archivedAt).length,
    archivedItemCount: (archiveResult.rows[0]?.count ?? 0) + tools.filter((tool) => tool.archivedAt).length,
    hasDashboard: exists,
  };
}

async function resolveTab(
  client: PoolClient,
  resourceId: string,
  tabName?: string,
) {
  const named = tabName?.trim();
  const existing = await client.query<DashboardTabRow>(
    named
      ? `SELECT id, name, position, archived_at, created_at, updated_at
         FROM lfp_dashboard_tabs
         WHERE resource_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL
         ORDER BY position LIMIT 1`
      : `SELECT id, name, position, archived_at, created_at, updated_at
         FROM lfp_dashboard_tabs
         WHERE resource_id = $1 AND archived_at IS NULL
         ORDER BY position, created_at LIMIT 1`,
    named ? [resourceId, named] : [resourceId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const position = await client.query<{ position: number }>(
    "SELECT COALESCE(max(position), -1) + 1 AS position FROM lfp_dashboard_tabs WHERE resource_id = $1",
    [resourceId],
  );
  const inserted = await client.query<DashboardTabRow>(
    `INSERT INTO lfp_dashboard_tabs (id, resource_id, name, position)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, position, archived_at, created_at, updated_at`,
    [randomUUID(), resourceId, named || "Dashboard", position.rows[0]?.position ?? 0],
  );
  return inserted.rows[0]!;
}

export async function upsertDashboardWidget(
  resourceId: string,
  input: DashboardWidgetDraft,
) {
  await ready();
  const draft = dashboardWidgetDraftSchema.parse(input);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    let existing: DashboardWidgetRow | undefined;
    let tab: DashboardTabRow;
    if (draft.widgetId) {
      const result = await client.query<DashboardWidgetRow>(
        `SELECT * FROM lfp_dashboard_widgets WHERE id = $1 AND resource_id = $2 FOR UPDATE`,
        [draft.widgetId, resourceId],
      );
      existing = result.rows[0];
      if (!existing) throw new Error("Dashboard widget was not found.");
      const tabResult = await client.query<DashboardTabRow>(
        "SELECT * FROM lfp_dashboard_tabs WHERE id = $1 AND resource_id = $2",
        [existing.tab_id, resourceId],
      );
      tab = tabResult.rows[0]!;
    } else {
      tab = await resolveTab(client, resourceId, draft.tabName);
      const result = await client.query<DashboardWidgetRow>(
        `SELECT * FROM lfp_dashboard_widgets
         WHERE resource_id = $1 AND tab_id = $2 AND lower(title) = lower($3)
           AND archived_at IS NULL
         ORDER BY created_at LIMIT 1 FOR UPDATE`,
        [resourceId, tab.id, draft.title],
      );
      existing = result.rows[0];
    }

    const position = existing?.position ?? (
      await client.query<{ position: number }>(
        "SELECT COALESCE(max(position), -1) + 1 AS position FROM lfp_dashboard_widgets WHERE resource_id = $1 AND tab_id = $2",
        [resourceId, tab.id],
      )
    ).rows[0]?.position ?? 0;
    const id = existing?.id ?? randomUUID();
    const result = await client.query<DashboardWidgetRow>(
      `INSERT INTO lfp_dashboard_widgets (
         id, resource_id, tab_id, title, description, code, capabilities,
         cache_ttl_seconds, refresh_interval_seconds, lazy, position
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         tab_id = EXCLUDED.tab_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         code = EXCLUDED.code,
         capabilities = EXCLUDED.capabilities,
         cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
         refresh_interval_seconds = EXCLUDED.refresh_interval_seconds,
         lazy = EXCLUDED.lazy,
         cached_output = NULL,
         cache_expires_at = NULL,
         last_error = NULL,
         archived_at = NULL,
         updated_at = now()
       RETURNING *`,
      [
        id,
        resourceId,
        tab.id,
        draft.title,
        draft.description ?? null,
        draft.code,
        draft.capabilities,
        draft.cacheTtlSeconds,
        draft.refreshIntervalSeconds ?? null,
        draft.lazy,
        position,
      ],
    );
    await client.query("COMMIT");
    return { created: !existing, tab: tabFromRow(tab, []), widget: widgetFromRow(result.rows[0]!) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function widgetRow(client: Pool | PoolClient, resourceId: string, widgetId: string) {
  const result = await client.query<DashboardWidgetRow>(
    `SELECT widget.* FROM lfp_dashboard_widgets widget
     JOIN lfp_dashboard_tabs tab ON tab.id = widget.tab_id
     WHERE widget.id = $1 AND widget.resource_id = $2
       AND widget.archived_at IS NULL AND tab.archived_at IS NULL`,
    [widgetId, resourceId],
  );
  return result.rows[0];
}

export type DashboardRefreshResult = {
  widget: DashboardWidget;
  cacheHit: boolean;
};

export type DashboardProgramExecutor = (options: {
  code: string;
  capabilities: string[];
  resourceId: string;
  cachedOutput?: import("@/lib/dashboard-spec").DashboardWidgetOutput;
  cacheAgeSeconds?: number;
  force?: boolean;
}) => Promise<{ output: import("@/lib/dashboard-spec").DashboardWidgetOutput; durationMs: number }>;

async function refreshWidgetNow(
  resourceId: string,
  widgetId: string,
  force: boolean,
  executeProgram: DashboardProgramExecutor,
): Promise<DashboardRefreshResult> {
  await ready();
  const row = await widgetRow(pool(), resourceId, widgetId);
  if (!row) throw new Error("Dashboard widget was not found.");
  const expiresAt = row.cache_expires_at ? new Date(row.cache_expires_at).getTime() : 0;
  if (!force && row.cached_output && expiresAt > Date.now()) {
    return { widget: widgetFromRow(row), cacheHit: true };
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const lockId = createHash("sha256")
      .update(`dashboard-widget\0${resourceId}\0${widgetId}`)
      .digest()
      .readBigInt64BE(0)
      .toString();
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockId]);

    // Double-check after waiting: another replica may have filled the cache.
    const lockedRow = await widgetRow(client, resourceId, widgetId);
    if (!lockedRow) throw new Error("Dashboard widget was not found.");
    const lockedExpiry = lockedRow.cache_expires_at
      ? new Date(lockedRow.cache_expires_at).getTime()
      : 0;
    const observedRunAt = row.last_run_at ? new Date(row.last_run_at).getTime() : 0;
    const lockedRunAt = lockedRow.last_run_at ? new Date(lockedRow.last_run_at).getTime() : 0;
    const anotherReplicaRefreshed = force && lockedRunAt > observedRunAt;
    if ((anotherReplicaRefreshed || !force) && lockedRow.cached_output && lockedExpiry > Date.now()) {
      await client.query("COMMIT");
      return { widget: widgetFromRow(lockedRow), cacheHit: true };
    }
    if (force) {
      // A user-triggered refresh is cache invalidation, not merely a TTL bypass.
      // Clear inside the advisory-lock transaction so cache_get() cannot return
      // the value that the user explicitly asked to replace.
      await client.query(
        `UPDATE lfp_dashboard_widgets
         SET cached_output = NULL, cache_expires_at = NULL, updated_at = now()
         WHERE id = $1 AND resource_id = $2`,
        [widgetId, resourceId],
      );
    }
    const previousOutput = !force && lockedRow.cached_output
      ? dashboardWidgetOutputSchema.safeParse(lockedRow.cached_output)
      : undefined;
    const lastRunAt = lockedRow.last_run_at
      ? new Date(lockedRow.last_run_at).getTime()
      : undefined;
    const execution = await executeProgram({
      code: lockedRow.code,
      capabilities: lockedRow.capabilities.map((value) => dashboardCapabilitySchema.parse(value)),
      resourceId,
      ...(previousOutput?.success ? { cachedOutput: previousOutput.data } : {}),
      ...(lastRunAt ? { cacheAgeSeconds: Math.max(0, (Date.now() - lastRunAt) / 1_000) } : {}),
      force,
    });
    const result = await client.query<DashboardWidgetRow>(
      `UPDATE lfp_dashboard_widgets SET
         cached_output = $3::jsonb,
         cache_expires_at = now() + ($4 * interval '1 second'),
         last_run_at = now(),
         last_duration_ms = $5,
         last_error = NULL,
         updated_at = now()
       WHERE id = $1 AND resource_id = $2
       RETURNING *`,
      [widgetId, resourceId, JSON.stringify(execution.output), lockedRow.cache_ttl_seconds, execution.durationMs],
    );
    await client.query("COMMIT");
    return { widget: widgetFromRow(result.rows[0]!), cacheHit: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Widget execution failed.";
    try {
      const result = await client.query<DashboardWidgetRow>(
        `UPDATE lfp_dashboard_widgets SET
           last_run_at = now(), last_error = $3, updated_at = now()
         WHERE id = $1 AND resource_id = $2
         RETURNING *`,
        [widgetId, resourceId, message.slice(0, 2_000)],
      );
      await client.query("COMMIT");
      if (!result.rows[0]) throw error;
      return { widget: widgetFromRow(result.rows[0]), cacheHit: false };
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function refreshDashboardWidget(
  resourceId: string,
  widgetId: string,
  executeProgram: DashboardProgramExecutor,
  options: { force?: boolean } = {},
) {
  return refreshWidgetNow(resourceId, widgetId, options.force ?? false, executeProgram);
}

export async function archiveDashboardWidget(
  resourceId: string,
  widgetId: string,
  archived: boolean,
) {
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DashboardWidgetRow>(
      `UPDATE lfp_dashboard_widgets SET archived_at = $3, updated_at = now()
       WHERE id = $1 AND resource_id = $2 RETURNING *`,
      [widgetId, resourceId, archived ? new Date() : null],
    );
    if (!result.rows[0]) throw new Error("Dashboard widget was not found.");
    if (!archived) {
      await client.query(
        `UPDATE lfp_dashboard_tabs SET archived_at = NULL, updated_at = now()
         WHERE id = $1 AND resource_id = $2`,
        [result.rows[0].tab_id, resourceId],
      );
    }
    await client.query("COMMIT");
    return widgetFromRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteDashboardWidget(resourceId: string, widgetId: string) {
  await ready();
  const result = await pool().query<{ id: string }>(
    `DELETE FROM lfp_dashboard_widgets
     WHERE id = $1 AND resource_id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [widgetId, resourceId],
  );
  if (!result.rowCount) throw new Error("Archive the dashboard widget before deleting it permanently.");
  return { deleted: true, id: widgetId };
}

export async function archiveDashboardTab(
  resourceId: string,
  tabId: string,
  archived: boolean,
) {
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DashboardTabRow>(
      `UPDATE lfp_dashboard_tabs SET archived_at = $3, updated_at = now()
       WHERE id = $1 AND resource_id = $2 RETURNING *`,
      [tabId, resourceId, archived ? new Date() : null],
    );
    if (!result.rows[0]) throw new Error("Dashboard tab was not found.");
    await client.query(
      `UPDATE lfp_dashboard_widgets SET archived_at = $3, updated_at = now()
       WHERE tab_id = $1 AND resource_id = $2`,
      [tabId, resourceId, archived ? new Date() : null],
    );
    await client.query("COMMIT");
    return tabFromRow(result.rows[0], []);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteDashboardTab(resourceId: string, tabId: string) {
  await ready();
  const result = await pool().query<{ id: string }>(
    `DELETE FROM lfp_dashboard_tabs
     WHERE id = $1 AND resource_id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [tabId, resourceId],
  );
  if (!result.rowCount) throw new Error("Archive the dashboard tab before deleting it permanently.");
  return { deleted: true, id: tabId };
}

import { createHash, randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { serverConfig } from "@/lib/config";
import { listDashboardUserTools } from "@/lib/dashboard-user-tool-store";
import {
  dashboardCapabilitySchema,
  dashboardWidgetLayoutSchema,
  dashboardWidgetDraftSchema,
  dashboardWidgetOutputSchema,
  type DashboardState,
  type DashboardTab,
  type DashboardWidget,
  type DashboardWidgetDraft,
  type DashboardWidgetLayout,
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
  css: string | null;
  css_isolation: "shadow" | "scoped";
  tool_name: string | null;
  tool_input: unknown;
  capabilities: string[];
  cache_ttl_seconds: number;
  refresh_interval_seconds: number | null;
  lazy: boolean;
  position: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
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
      css text,
      css_isolation text NOT NULL DEFAULT 'shadow',
      tool_name text,
      tool_input jsonb NOT NULL DEFAULT '{}',
      capabilities text[] NOT NULL DEFAULT '{}',
      cache_ttl_seconds integer NOT NULL DEFAULT 300,
      refresh_interval_seconds integer,
      lazy boolean NOT NULL DEFAULT false,
      position integer NOT NULL DEFAULT 0,
      grid_x integer NOT NULL DEFAULT 0,
      grid_y integer NOT NULL DEFAULT 0,
      grid_w integer NOT NULL DEFAULT 6,
      grid_h integer NOT NULL DEFAULT 4,
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
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS tool_name text;
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS tool_input jsonb NOT NULL DEFAULT '{}';
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS css text;
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS css_isolation text NOT NULL DEFAULT 'shadow';
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS grid_x integer;
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS grid_y integer;
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS grid_w integer;
    ALTER TABLE lfp_dashboard_widgets ADD COLUMN IF NOT EXISTS grid_h integer;
    UPDATE lfp_dashboard_widgets SET
      grid_x = (position % 2) * 6,
      grid_y = (position / 2) * 4,
      grid_w = 6,
      grid_h = 4
    WHERE grid_x IS NULL OR grid_y IS NULL OR grid_w IS NULL OR grid_h IS NULL;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_x SET DEFAULT 0;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_x SET NOT NULL;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_y SET DEFAULT 0;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_y SET NOT NULL;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_w SET DEFAULT 6;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_w SET NOT NULL;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_h SET DEFAULT 4;
    ALTER TABLE lfp_dashboard_widgets ALTER COLUMN grid_h SET NOT NULL;
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
    toolName: row.tool_name ?? "missing_saved_tool",
    toolInput: dashboardWidgetDraftSchema.shape.toolInput.parse(row.tool_input ?? {}),
    code: row.code,
    ...(row.css ? { css: row.css } : {}),
    cssIsolation: row.css_isolation,
    position: row.position,
    layout: { x: row.grid_x, y: row.grid_y, w: row.grid_w, h: row.grid_h },
    ...(output?.success ? { output: output.data } : {}),
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
  const result = await pool().query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM lfp_dashboard_widgets WHERE resource_id = $1) AS exists",
    [resourceId],
  );
  return result.rows[0]?.exists ?? false;
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
      `SELECT id, tab_id, title, description, code, css, css_isolation, tool_name, tool_input, capabilities,
              cache_ttl_seconds, refresh_interval_seconds, lazy, position,
              grid_x, grid_y, grid_w, grid_h,
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
    archivedItemCount: archiveResult.rows[0]?.count ?? 0,
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
    const defaultGridX = (position % 2) * 6;
    const defaultGridY = Math.floor(position / 2) * 4;
    const result = await client.query<DashboardWidgetRow>(
      `INSERT INTO lfp_dashboard_widgets (
         id, resource_id, tab_id, title, description, code, css, css_isolation, tool_name, tool_input,
         capabilities, cache_ttl_seconds, refresh_interval_seconds, lazy, position,
         grid_x, grid_y, grid_w, grid_h
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, '{}', 0, NULL, false, $11, $12, $13, 6, 4)
       ON CONFLICT (id) DO UPDATE SET
         tab_id = EXCLUDED.tab_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         code = EXCLUDED.code,
         css = EXCLUDED.css,
         css_isolation = EXCLUDED.css_isolation,
         tool_name = EXCLUDED.tool_name,
         tool_input = EXCLUDED.tool_input,
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
        draft.css ?? null,
        draft.cssIsolation ?? "shadow",
        draft.toolName,
        JSON.stringify(draft.toolInput),
        position,
        existing?.grid_x ?? defaultGridX,
        existing?.grid_y ?? defaultGridY,
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
  toolName: string;
  toolInput: unknown;
  resourceId: string;
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
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const lockId = createHash("sha256")
      .update(`dashboard-widget\0${resourceId}\0${widgetId}`)
      .digest()
      .readBigInt64BE(0)
      .toString();
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockId]);

    const lockedRow = await widgetRow(client, resourceId, widgetId);
    if (!lockedRow) throw new Error("Dashboard widget was not found.");
    if (!lockedRow.tool_name) throw new Error("This legacy widget must be updated to use a saved tool.");
    const execution = await executeProgram({
      code: lockedRow.code,
      toolName: dashboardCapabilitySchema.parse(lockedRow.tool_name),
      toolInput: lockedRow.tool_input ?? {},
      resourceId,
      force,
    });
    const result = await client.query<DashboardWidgetRow>(
      `UPDATE lfp_dashboard_widgets SET
         cached_output = $3::jsonb,
         cache_expires_at = NULL,
         last_run_at = now(),
         last_duration_ms = $4,
         last_error = NULL,
         updated_at = now()
       WHERE id = $1 AND resource_id = $2
       RETURNING *`,
      [widgetId, resourceId, JSON.stringify(execution.output), execution.durationMs],
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

export async function updateDashboardWidgetMetadata(
  resourceId: string,
  widgetId: string,
  metadata: { title: string; description: string },
) {
  await ready();
  const result = await pool().query<DashboardWidgetRow>(
    `UPDATE lfp_dashboard_widgets
     SET title = $3, description = NULLIF($4, ''), updated_at = now()
     WHERE id = $1 AND resource_id = $2 RETURNING *`,
    [widgetId, resourceId, metadata.title.trim(), metadata.description.trim()],
  );
  if (!result.rows[0]) throw new Error("Dashboard widget was not found.");
  return widgetFromRow(result.rows[0]);
}

export async function updateDashboardWidgetCss(
  resourceId: string,
  widgetId: string,
  css: string,
) {
  await ready();
  const result = await pool().query<DashboardWidgetRow>(
    `UPDATE lfp_dashboard_widgets
     SET css = NULLIF($3, ''), updated_at = now()
     WHERE id = $1 AND resource_id = $2 RETURNING *`,
    [widgetId, resourceId, css.trim()],
  );
  if (!result.rows[0]) throw new Error("Dashboard widget was not found.");
  return widgetFromRow(result.rows[0]);
}

export async function updateDashboardWidgetLayouts(
  resourceId: string,
  layouts: DashboardWidgetLayout[],
) {
  await ready();
  const parsed = layouts.map((layout) => dashboardWidgetLayoutSchema.parse(layout));
  if (!parsed.length) return [];
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const updated: DashboardWidget[] = [];
    for (const layout of parsed) {
      const result = await client.query<DashboardWidgetRow>(
        `UPDATE lfp_dashboard_widgets SET
           grid_x = $3, grid_y = $4, grid_w = $5, grid_h = $6, updated_at = now()
         WHERE id = $1 AND resource_id = $2 AND archived_at IS NULL
         RETURNING *`,
        [layout.widgetId, resourceId, layout.x, layout.y, layout.w, layout.h],
      );
      if (!result.rows[0]) throw new Error("Dashboard widget was not found.");
      updated.push(widgetFromRow(result.rows[0]));
    }
    await client.query("COMMIT");
    return updated;
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

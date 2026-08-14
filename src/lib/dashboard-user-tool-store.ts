import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";

import { serverConfig } from "@/lib/config";
import {
  dashboardCapabilitySchema,
  dashboardUserToolDraftSchema,
  type DashboardUserTool,
  type DashboardUserToolDraft,
} from "@/lib/dashboard-spec";

type ToolRow = {
  id: string;
  name: string;
  title: string;
  description: string;
  code: string;
  capabilities: string[];
  cache_ttl_seconds: number;
  last_run_at: Date | string | null;
  last_duration_ms: number | null;
  last_error: string | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const globals = globalThis as typeof globalThis & {
  lfpDashboardToolPool?: Pool;
  lfpDashboardToolReady?: Promise<void>;
};

function pool() {
  // A composed tool holds its advisory-lock transaction while dependencies run.
  // Match the runtime's nesting ceiling so a valid chain cannot exhaust the pool.
  return (globals.lfpDashboardToolPool ??= new Pool({ connectionString: serverConfig.databaseUrl, max: 8 }));
}

async function ready() {
  globals.lfpDashboardToolReady ??= pool().query(`
    CREATE TABLE IF NOT EXISTS lfp_dashboard_user_tools (
      id text PRIMARY KEY,
      resource_id text NOT NULL,
      name text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      code text NOT NULL,
      capabilities text[] NOT NULL DEFAULT '{}',
      cache_ttl_seconds integer NOT NULL DEFAULT 300,
      last_run_at timestamptz,
      last_duration_ms integer,
      last_error text,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (resource_id, name)
    );
    CREATE INDEX IF NOT EXISTS lfp_dashboard_user_tools_resource_idx
      ON lfp_dashboard_user_tools (resource_id, created_at);
    CREATE TABLE IF NOT EXISTS lfp_dashboard_tool_cache (
      resource_id text NOT NULL,
      tool_id text NOT NULL REFERENCES lfp_dashboard_user_tools(id) ON DELETE CASCADE,
      cache_key text NOT NULL,
      value jsonb NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_id, tool_id, cache_key)
    );
  `).then(() => undefined);
  return globals.lfpDashboardToolReady;
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : undefined;
}

function fromRow(row: ToolRow): DashboardUserTool {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description,
    code: row.code,
    capabilities: row.capabilities.map((value) => dashboardCapabilitySchema.parse(value)),
    cacheTtlSeconds: row.cache_ttl_seconds,
    ...(iso(row.last_run_at) ? { lastRunAt: iso(row.last_run_at) } : {}),
    ...(row.last_duration_ms !== null ? { lastDurationMs: row.last_duration_ms } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(iso(row.archived_at) ? { archivedAt: iso(row.archived_at) } : {}),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function listDashboardUserTools(resourceId: string, includeArchived = false) {
  await ready();
  const result = await pool().query<ToolRow>(
    `SELECT * FROM lfp_dashboard_user_tools
     WHERE resource_id = $1 AND ($2 OR archived_at IS NULL)
     ORDER BY created_at`,
    [resourceId, includeArchived],
  );
  return result.rows.map(fromRow);
}

export async function getDashboardUserTool(resourceId: string, name: string) {
  await ready();
  const result = await pool().query<ToolRow>(
    `SELECT * FROM lfp_dashboard_user_tools
     WHERE resource_id = $1 AND name = $2 AND archived_at IS NULL`,
    [resourceId, dashboardCapabilitySchema.parse(name)],
  );
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

export async function upsertDashboardUserTool(resourceId: string, input: DashboardUserToolDraft) {
  await ready();
  const draft = dashboardUserToolDraftSchema.parse(input);
  const id = draft.toolId ?? randomUUID();
  const result = await pool().query<ToolRow>(
    `INSERT INTO lfp_dashboard_user_tools
       (id, resource_id, name, title, description, code, capabilities, cache_ttl_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (resource_id, name) DO UPDATE SET
       title=EXCLUDED.title, description=EXCLUDED.description, code=EXCLUDED.code,
       capabilities=EXCLUDED.capabilities, cache_ttl_seconds=EXCLUDED.cache_ttl_seconds,
       archived_at=NULL, last_error=NULL, updated_at=now()
     RETURNING *`,
    [id, resourceId, draft.name, draft.title, draft.description, draft.code, draft.capabilities, draft.cacheTtlSeconds],
  );
  return fromRow(result.rows[0]!);
}

export async function setDashboardUserToolArchived(resourceId: string, id: string, archived: boolean) {
  await ready();
  const result = await pool().query<ToolRow>(
    `UPDATE lfp_dashboard_user_tools SET archived_at=$3, updated_at=now()
     WHERE id=$1 AND resource_id=$2 RETURNING *`,
    [id, resourceId, archived ? new Date() : null],
  );
  if (!result.rows[0]) throw new Error("Dashboard tool was not found.");
  return fromRow(result.rows[0]);
}

export async function deleteDashboardUserTool(resourceId: string, id: string) {
  await ready();
  const result = await pool().query(
    `DELETE FROM lfp_dashboard_user_tools
     WHERE id=$1 AND resource_id=$2 AND archived_at IS NOT NULL RETURNING id`,
    [id, resourceId],
  );
  if (!result.rowCount) throw new Error("Archive the dashboard tool before deleting it permanently.");
  return { deleted: true, id };
}

export async function cachedDashboardToolCall<T>(options: {
  resourceId: string;
  tool: DashboardUserTool;
  input: unknown;
  compute: () => Promise<T>;
  force?: boolean;
}) {
  await ready();
  if (options.tool.cacheTtlSeconds === 0) return { value: await options.compute(), cacheHit: false };
  const cacheKey = createHash("sha256").update(stableJson(options.input)).digest("hex");
  const fast = options.force ? undefined : await pool().query<{ value: T }>(
    `SELECT value FROM lfp_dashboard_tool_cache
     WHERE resource_id=$1 AND tool_id=$2 AND cache_key=$3 AND expires_at>now()`,
    [options.resourceId, options.tool.id, cacheKey],
  );
  if (fast?.rows[0]) return { value: fast.rows[0].value, cacheHit: true };

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const lockId = createHash("sha256").update(`dashboard-tool\0${options.resourceId}\0${options.tool.id}\0${cacheKey}`).digest().readBigInt64BE(0).toString();
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockId]);
    if (options.force) {
      await client.query(
        `DELETE FROM lfp_dashboard_tool_cache
         WHERE resource_id=$1 AND tool_id=$2 AND cache_key=$3`,
        [options.resourceId, options.tool.id, cacheKey],
      );
    }
    const checked = await client.query<{ value: T }>(
      `SELECT value FROM lfp_dashboard_tool_cache
       WHERE resource_id=$1 AND tool_id=$2 AND cache_key=$3 AND expires_at>now()`,
      [options.resourceId, options.tool.id, cacheKey],
    );
    if (!options.force && checked.rows[0]) {
      await client.query("COMMIT");
      return { value: checked.rows[0].value, cacheHit: true };
    }
    const value = await options.compute();
    await client.query(
      `INSERT INTO lfp_dashboard_tool_cache (resource_id,tool_id,cache_key,value,expires_at)
       VALUES ($1,$2,$3,$4::jsonb,now()+($5*interval '1 second'))
       ON CONFLICT (resource_id,tool_id,cache_key) DO UPDATE SET
         value=EXCLUDED.value, expires_at=EXCLUDED.expires_at, created_at=now()`,
      [options.resourceId, options.tool.id, cacheKey, JSON.stringify(value), options.tool.cacheTtlSeconds],
    );
    await client.query("COMMIT");
    return { value, cacheHit: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordDashboardUserToolRun(resourceId: string, id: string, durationMs: number, error?: string) {
  await ready();
  await pool().query(
    `UPDATE lfp_dashboard_user_tools SET last_run_at=now(), last_duration_ms=$3,
       last_error=$4, updated_at=now() WHERE id=$1 AND resource_id=$2`,
    [id, resourceId, durationMs, error?.slice(0, 2_000) ?? null],
  );
}

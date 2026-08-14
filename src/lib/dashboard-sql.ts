import { parse } from "pgsql-ast-parser";
import { Pool } from "pg";

import { serverConfig } from "@/lib/config";
import { truncateToolValue } from "@/lib/tool-output";

const globalForDashboardSql = globalThis as typeof globalThis & {
  lfpDashboardSqlPool?: Pool;
};

function dashboardSqlPool() {
  if (!serverConfig.dashboard.sqlDatabaseUrl) {
    throw new Error("The host has not configured DASHBOARD_SQL_DATABASE_URL_FILE.");
  }
  return (globalForDashboardSql.lfpDashboardSqlPool ??= new Pool({
    connectionString: serverConfig.dashboard.sqlDatabaseUrl,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: serverConfig.dashboard.sqlConnectionTimeoutMs,
  }));
}

/** Execute one bounded SELECT against the host-configured dashboard data source. */
export async function executeDashboardSql(sql: string) {
  const statements = parse(sql);
  if (statements.length !== 1 || statements[0]?.type !== "select") {
    throw new Error("sql_query() accepts exactly one read-only SELECT statement.");
  }

  const client = await dashboardSqlPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(
      `SET LOCAL statement_timeout = '${serverConfig.dashboard.sqlStatementTimeoutMs}ms'`,
    );
    const result = await client.query<Record<string, unknown>>(sql);
    const rows = result.rows.slice(0, 100).map((row) =>
      truncateToolValue(row) as Record<string, unknown>,
    );
    await client.query("ROLLBACK");
    return {
      columns: result.fields.map((field) => field.name),
      rows,
      rowCount: result.rowCount ?? rows.length,
      truncated: result.rows.length > rows.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

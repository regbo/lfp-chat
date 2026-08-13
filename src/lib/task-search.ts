import { Pool } from "pg";

import { serverConfig } from "@/lib/config";
import type { Task } from "@/lib/tasks";

const globalForTaskSearch = globalThis as typeof globalThis & {
  lfpTaskSearchPool?: Pool;
  lfpTaskSearchReady?: Promise<void>;
};

function pool() {
  return globalForTaskSearch.lfpTaskSearchPool ??= new Pool({
    connectionString: serverConfig.databaseUrl,
    max: 3,
  });
}

async function ready() {
  globalForTaskSearch.lfpTaskSearchReady ??= pool().query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE TABLE IF NOT EXISTS lfp_task_search (
      id bigint PRIMARY KEY,
      list_id bigint NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      search_text text NOT NULL,
      search_vector tsvector NOT NULL,
      payload jsonb NOT NULL,
      indexed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lfp_task_search_vector_idx
      ON lfp_task_search USING gin (search_vector);
    CREATE INDEX IF NOT EXISTS lfp_task_search_text_trgm_idx
      ON lfp_task_search USING gin (search_text gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS lfp_task_search_tags_idx
      ON lfp_task_search USING gin (tags);
  `).then(() => undefined);
  return globalForTaskSearch.lfpTaskSearchReady;
}

async function synchronize(tasks: Task[]) {
  if (tasks.length === 0) return;
  await ready();
  await pool().query(`
    INSERT INTO lfp_task_search (
      id, list_id, tags, search_text, search_vector, payload, indexed_at
    )
    SELECT
      record.id,
      record.list_id,
      record.tags,
      concat_ws(' ', record.title, record.description, array_to_string(record.tags, ' ')),
      setweight(to_tsvector('english', coalesce(record.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(record.description, '')), 'B') ||
        setweight(to_tsvector('english', array_to_string(record.tags, ' ')), 'C'),
      record.payload,
      now()
    FROM jsonb_to_recordset($1::jsonb) AS record(
      id bigint,
      list_id bigint,
      title text,
      description text,
      tags text[],
      payload jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      list_id = EXCLUDED.list_id,
      tags = EXCLUDED.tags,
      search_text = EXCLUDED.search_text,
      search_vector = EXCLUDED.search_vector,
      payload = EXCLUDED.payload,
      indexed_at = now()
  `, [JSON.stringify(tasks.map((task) => ({
    id: task.id,
    list_id: task.listId,
    title: task.title,
    description: task.description ?? "",
    tags: (task.tags ?? []).map((tag) => tag.toLocaleLowerCase()),
    payload: task,
  })))]);
}

/** Rank the current Vikunja task snapshot with Postgres FTS and trigram similarity. */
export async function searchTasks(
  tasks: Task[],
  input: { query?: string; tags?: string[] },
) {
  if (tasks.length === 0) return [];
  await synchronize(tasks);
  const query = input.query?.trim() ?? "";
  const tags = (input.tags ?? []).map((tag) => tag.toLocaleLowerCase());
  const result = await pool().query<{ payload: Task }>(`
    WITH search_query AS (
      SELECT CASE WHEN $2 = '' THEN NULL ELSE websearch_to_tsquery('english', $2) END AS value
    )
    SELECT task.payload
    FROM lfp_task_search AS task
    CROSS JOIN search_query
    WHERE task.id = ANY($1::bigint[])
      AND $3::text[] <@ task.tags
      AND (
        $2 = ''
        OR task.search_vector @@ search_query.value
        OR task.search_text ILIKE '%' || $2 || '%'
        OR word_similarity(lower($2), lower(task.search_text)) >= 0.25
      )
    ORDER BY
      CASE WHEN lower(task.search_text) LIKE lower($2) || '%' THEN 1 ELSE 0 END DESC,
      CASE WHEN $2 = '' THEN 0 ELSE ts_rank_cd(task.search_vector, search_query.value, 32) END DESC,
      CASE WHEN $2 = '' THEN 0 ELSE similarity(lower(task.search_text), lower($2)) END DESC,
      CASE WHEN $2 = '' THEN 0 ELSE word_similarity(lower($2), lower(task.search_text)) END DESC,
      task.id DESC
  `, [tasks.map((task) => task.id), query, tags]);
  return result.rows.map((row) => row.payload);
}

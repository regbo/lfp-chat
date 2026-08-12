import { createTool } from "@mastra/core/tools";
import { CollectStreams, Monty } from "@pydantic/monty";
import { parse } from "pgsql-ast-parser";
import { Pool } from "pg";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import { truncateToolText, truncateToolValue } from "@/lib/tool-output";
import {
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  listTaskLists,
  listTasks,
  updateTask,
  updateTaskList,
} from "@/lib/vikunja";

const globalForMonty = globalThis as typeof globalThis & {
  lfpMontyPool?: Promise<Monty>;
  lfpFamilySqlPool?: Pool;
};

function getMontyPool() {
  return (
    globalForMonty.lfpMontyPool ??=
      Monty.create({
        minProcesses: 1,
        maxProcesses: 2,
        checkoutTimeout: 5,
        requestTimeout: 10,
        maxCheckoutsPerWorker: 100,
      }).catch((error) => {
        globalForMonty.lfpMontyPool = undefined;
        throw error;
      })
  );
}

const projectKnowledge = [
  {
    title: "Mastra memory",
    text: "Conversation history and working memory are persisted in PostgreSQL and scoped by resource and thread IDs.",
  },
  {
    title: "Rich tool events",
    text: "Mastra streams tool inputs, execution states, outputs, errors, reasoning, and text through the AI SDK compatibility bridge.",
  },
  {
    title: "Interface stack",
    text: "The client uses AI SDK useChat with AI Elements for messages, markdown, the composer, reasoning, and tool details.",
  },
  {
    title: "Local database",
    text: "Docker Compose starts a local Postgres service on port 5432. Mastra initializes its storage tables automatically.",
  },
];

export const searchTool = createTool({
  id: "search",
  description:
    "Search the project's built-in knowledge. Use this for questions about the app, Mastra, memory, tool events, or the local stack.",
  inputSchema: z.object({
    query: z.string().min(1).describe("A concise search query"),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({ title: z.string(), snippet: z.string(), score: z.number() }),
    ),
  }),
  execute: async ({ query }) => {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const ranked = projectKnowledge
      .map((entry) => {
        const haystack = `${entry.title} ${entry.text}`.toLowerCase();
        const score = terms.reduce(
          (total, term) => total + (haystack.includes(term) ? 1 : 0),
          0,
        );
        return { ...entry, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ title, text, score }) => ({ title, snippet: text, score }));

    return { query, results: ranked };
  },
});

export const calculatorTool = createTool({
  id: "calculator",
  description:
    "Perform a basic arithmetic calculation with two numbers. Use it instead of estimating arithmetic.",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    left: z.number(),
    right: z.number(),
  }),
  outputSchema: z.object({ result: z.number() }),
  execute: async ({ operation, left, right }) => {
    if (operation === "divide" && right === 0) {
      throw new Error("Cannot divide by zero.");
    }

    const operations = {
      add: () => left + right,
      subtract: () => left - right,
      multiply: () => left * right,
      divide: () => left / right,
    };

    return { result: operations[operation]() };
  },
});

export const montyTool = createTool({
  id: "monty",
  description:
    "Execute self-contained Python code in Monty's isolated, resource-limited sandbox. Use for code execution, data transformations, algorithms, or calculations that need Python.",
  inputSchema: z.object({
    code: z.string().min(1).max(20_000).describe("Python code to execute"),
  }),
  outputSchema: z.object({
    result: z.unknown(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  execute: async ({ code }) => {
    const pool = await getMontyPool();
    await using session = await pool.checkout({
      limits: {
        maxDurationSecs: 5,
        maxMemory: 100 * 1024 * 1024,
        maxRecursionDepth: 200,
      },
    });
    const streams = new CollectStreams(1024 * 1024);
    const result = await session.feedRun(code, { printCallback: streams });

    return {
      result: truncateToolValue(result),
      stdout: truncateToolText(streams.output
        .filter((entry) => entry.stream === "stdout")
        .map((entry) => entry.text)
        .join("")),
      stderr: truncateToolText(streams.output
        .filter((entry) => entry.stream === "stderr")
        .map((entry) => entry.text)
        .join("")),
    };
  },
});

function getFamilySqlPool() {
  if (!serverConfig.familyDatabaseUrl) {
    throw new Error("FAMILY_DATABASE_URL_FILE is not configured.");
  }
  return (globalForMonty.lfpFamilySqlPool ??= new Pool({
    connectionString: serverConfig.familyDatabaseUrl,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: serverConfig.familySqlConnectionTimeoutMs,
  }));
}

export const familyDatabaseTool = createTool({
  id: "family_database",
  description: `Look up structured family records using one generated read-only database query.
Available public tables: documents (ingest_id, family_id, source, external_id, title, body_text, metadata JSONB, labels JSONB, occurred_at, ingested_at, processed_at), attachments (attachment_id, ingest_id, filename, content_type, size, extracted_text, labels JSONB, metadata JSONB, processed_at), deadlines (title, due_at, evidence, confidence, status), source_cursors, processing_events (source, stage, status, detail JSONB, created_at), and graph_outbox (attempts, delivered_at, last_error). Use JSONB operators for labels or metadata. Always select only the columns needed and add a LIMIT.`,
  inputSchema: z.object({
    sql: z
      .string()
      .min(1)
      .max(10_000)
      .describe("One PostgreSQL SELECT statement with no mutation"),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
    rowCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async ({ sql }) => {
    const statements = parse(sql);
    if (statements.length !== 1 || statements[0]?.type !== "select") {
      throw new Error("Only one read-only SELECT statement is allowed.");
    }

    const client = await getFamilySqlPool().connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(
        `SET LOCAL statement_timeout = '${serverConfig.familySqlStatementTimeoutMs}ms'`,
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
  },
});

async function embedFamilyQuery(query: string) {
  if (!serverConfig.openaiApiKey) {
    throw new Error("OpenAI is not configured for family search embeddings.");
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverConfig.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: serverConfig.familyEmbeddingModel,
      input: query,
      dimensions: serverConfig.familyEmbeddingDimensions,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embedding query failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (
    !embedding ||
    embedding.length !== serverConfig.familyEmbeddingDimensions
  ) {
    throw new Error("Embedding query returned an invalid vector.");
  }
  return `[${embedding.join(",")}]`;
}

export const familySearchTool = createTool({
  id: "family_search",
  description:
    "Hybrid PostgreSQL search over email bodies and attachment text. Combines pgvector semantic similarity with PostgreSQL full-text ranking and returns source UUIDs for exact retrieval.",
  inputSchema: z.object({
    query: z.string().min(1).max(2_000),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async ({ query, limit }) => {
    const vector = await embedFamilyQuery(query);
    const sql = `
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', $1) AS terms, $2::vector AS embedding
      ), candidates AS (
        SELECT 'document' AS kind, d.ingest_id::text AS item_id,
               d.ingest_id::text AS ingest_id, d.title, d.body_text AS content,
               d.labels, d.occurred_at, 1 - (d.embedding <=> q.embedding) AS vector_score,
               0::real AS text_score
        FROM documents d CROSS JOIN search_query q
        WHERE d.embedding IS NOT NULL
        ORDER BY d.embedding <=> q.embedding LIMIT 50
      ), document_text AS (
        SELECT 'document' AS kind, d.ingest_id::text AS item_id,
               d.ingest_id::text AS ingest_id, d.title, d.body_text AS content,
               d.labels, d.occurred_at, 0::double precision AS vector_score,
               ts_rank_cd(d.search_tsv, q.terms) AS text_score
        FROM documents d CROSS JOIN search_query q
        WHERE d.search_tsv @@ q.terms
        ORDER BY text_score DESC LIMIT 50
      ), attachment_vector AS (
        SELECT 'attachment' AS kind, a.attachment_id::text AS item_id,
               a.ingest_id::text AS ingest_id, a.filename AS title,
               a.extracted_text AS content, a.labels, d.occurred_at,
               1 - (a.embedding <=> q.embedding) AS vector_score, 0::real AS text_score
        FROM attachments a JOIN documents d USING (ingest_id) CROSS JOIN search_query q
        WHERE a.embedding IS NOT NULL
        ORDER BY a.embedding <=> q.embedding LIMIT 50
      ), attachment_text AS (
        SELECT 'attachment' AS kind, a.attachment_id::text AS item_id,
               a.ingest_id::text AS ingest_id, a.filename AS title,
               a.extracted_text AS content, a.labels, d.occurred_at,
               0::double precision AS vector_score,
               ts_rank_cd(a.search_tsv, q.terms) AS text_score
        FROM attachments a JOIN documents d USING (ingest_id) CROSS JOIN search_query q
        WHERE a.search_tsv @@ q.terms
        ORDER BY text_score DESC LIMIT 50
      ), combined AS (
        SELECT * FROM candidates UNION ALL SELECT * FROM document_text
        UNION ALL SELECT * FROM attachment_vector UNION ALL SELECT * FROM attachment_text
      )
      SELECT kind, item_id, ingest_id, title, left(content, 1200) AS snippet,
             labels, occurred_at,
             round((max(vector_score) * 0.7 + least(max(text_score), 1) * 0.3)::numeric, 6) AS score,
             round(max(vector_score)::numeric, 6) AS vector_score,
             round(max(text_score)::numeric, 6) AS text_score
      FROM combined
      GROUP BY kind, item_id, ingest_id, title, content, labels, occurred_at
      ORDER BY score DESC
      LIMIT $3`;
    const result = await getFamilySqlPool().query<Record<string, unknown>>(sql, [
      query,
      vector,
      limit,
    ]);
    return {
      query,
      results: result.rows.map((row) =>
        truncateToolValue(row) as Record<string, unknown>,
      ),
    };
  },
});

export const familyGraphTool = createTool({
  id: "family_graph",
  description:
    "Search Graphiti's temporal family knowledge graph for entities, relationships, and facts derived from ingested family context. Use alongside family_database when both structured records and semantic relationships can help.",
  inputSchema: z.object({
    query: z.string().min(1).max(2_000),
    maxFacts: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    query: z.string(),
    facts: z.array(z.record(z.string(), z.unknown())),
    warning: z.string().optional(),
  }),
  execute: async ({ query, maxFacts }) => {
    if (!serverConfig.graphitiApiUrl) {
      throw new Error("GRAPHITI_API_URL is not configured.");
    }
    try {
      const response = await fetch(
        new URL("/search", serverConfig.graphitiApiUrl),
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_ids: [serverConfig.familyGraphGroupId],
          query,
          max_facts: maxFacts,
        }),
          signal: AbortSignal.timeout(serverConfig.familyGraphTimeoutMs),
        },
      );
      if (!response.ok) {
        return {
          query,
          facts: [],
          warning: `Family graph search is temporarily unavailable (HTTP ${response.status}).`,
        };
      }
      const payload = (await response.json()) as {
        facts?: Array<Record<string, unknown>>;
      };
      return { query, facts: payload.facts ?? [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return {
        query,
        facts: [],
        warning: `Family graph search is temporarily unavailable: ${reason}`,
      };
    }
  },
});

async function familyContextRequest(path: string, init: RequestInit = {}) {
  if (!serverConfig.familyContextApiUrl || !serverConfig.familyContextApiKey) {
    throw new Error("The family context retrieval API is not configured.");
  }
  const response = await fetch(new URL(path, serverConfig.familyContextApiUrl), {
    ...init,
    headers: {
      "X-LFP-Context-Key": serverConfig.familyContextApiKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) {
    throw new Error(`Family context request failed with HTTP ${response.status}.`);
  }
  return response;
}

export const familyEmailTool = createTool({
  id: "family_email",
  description:
    "Retrieve an actual archived Gmail message by ingest UUID. Use content for parsed body and attachment metadata, mime for the MIME structure, or raw for the original RFC 822 message as base64.",
  inputSchema: z.object({
    ingestId: z.string().uuid(),
    mode: z.enum(["content", "mime", "raw"]).default("content"),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ ingestId, mode }) => {
    const suffix = mode === "content" ? "" : `/${mode}`;
    const response = await familyContextRequest(`/v1/messages/${ingestId}${suffix}`);
    if (mode === "raw") {
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        ingestId,
        contentType: response.headers.get("content-type") ?? "message/rfc822",
        size: bytes.length,
        contentBase64: bytes.toString("base64"),
      };
    }
    return truncateToolValue(await response.json()) as Record<string, unknown>;
  },
});

export const familyAttachmentTool = createTool({
  id: "family_attachment",
  description:
    "Retrieve a stored Gmail attachment by attachment UUID. Use metadata for Docling text and labels, or raw for the actual attachment bytes as base64.",
  inputSchema: z.object({
    attachmentId: z.string().uuid(),
    mode: z.enum(["metadata", "raw"]).default("metadata"),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ attachmentId, mode }) => {
    const suffix = mode === "raw" ? "/raw" : "";
    const response = await familyContextRequest(
      `/v1/attachments/${attachmentId}${suffix}`,
    );
    if (mode === "raw") {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) {
        throw new Error("Attachment exceeds the 5 MiB tool transfer limit.");
      }
      return {
        attachmentId,
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        size: bytes.length,
        contentBase64: bytes.toString("base64"),
      };
    }
    return truncateToolValue(await response.json()) as Record<string, unknown>;
  },
});

export const taskListTool = createTool({
  id: "task_list",
  description:
    "List tasks in one task list, or across all lists. Use task_list_lists first when the user names a list but you do not know its ID.",
  inputSchema: z.object({
    listId: z.number().int().positive().optional(),
    allLists: z.boolean().default(false),
    includeDone: z.boolean().default(false),
  }),
  outputSchema: z.object({ tasks: z.array(z.record(z.string(), z.unknown())) }),
  execute: async ({ allLists, includeDone, listId }) => ({
    tasks: (await listTasks({ allLists, includeDone, listId })).map(
      (task) => truncateToolValue(task) as Record<string, unknown>,
    ),
  }),
});

export const taskListListsTool = createTool({
  id: "task_list_lists",
  description:
    "List all available task lists and their numeric IDs. Use before creating or moving a task when a list was named.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    lists: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async () => ({
    lists: (await listTaskLists()).map(
      (list) => truncateToolValue(list) as Record<string, unknown>,
    ),
  }),
});

export const taskListCreateTool = createTool({
  id: "task_list_create",
  description: "Create a named task list.",
  inputSchema: z.object({
    name: z.string().trim().min(1).max(250),
    description: z.string().max(20_000).optional(),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async (input) =>
    truncateToolValue(await createTaskList(input)) as Record<string, unknown>,
});

export const taskListUpdateTool = createTool({
  id: "task_list_update",
  description: "Rename a task list or change its description by numeric list ID.",
  inputSchema: z.object({
    listId: z.number().int().positive(),
    name: z.string().trim().min(1).max(250).optional(),
    description: z.string().max(20_000).optional(),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ listId, ...update }) =>
    truncateToolValue(await updateTaskList(listId, update)) as Record<
      string,
      unknown
    >,
});

export const taskListDeleteTool = createTool({
  id: "task_list_delete",
  description:
    "Permanently delete a task list and every task in it. Only call after the user explicitly asks to delete that list.",
  inputSchema: z.object({ listId: z.number().int().positive() }),
  outputSchema: z.object({ deleted: z.boolean(), listId: z.number() }),
  execute: async ({ listId }) => {
    await deleteTaskList(listId);
    return { deleted: true, listId };
  },
});

export const taskCreateTool = createTool({
  id: "task_create",
  description: "Create a task in a chosen task list.",
  inputSchema: z.object({
    listId: z.number().int().positive().optional().describe(
      "The destination list ID. Omit to use the configured default list.",
    ),
    title: z.string().min(1).max(500),
    description: z.string().max(20_000).optional(),
    dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
    priority: z.number().int().min(0).max(5).optional(),
    links: z.array(z.object({
      label: z.string().trim().min(1).max(120),
      url: z.url().max(2_000),
    })).max(20).optional().describe(
      "Source emails, documents, or other URLs that should remain attached to the task.",
    ),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async (input) =>
    truncateToolValue(await createTask(input)) as Record<string, unknown>,
});

export const taskUpdateTool = createTool({
  id: "task_update",
  description:
    "Update a task by numeric task ID, including completing or reopening it.",
  inputSchema: z.object({
    taskId: z.number().int().positive(),
    listId: z.number().int().positive().optional().describe(
      "Move the task to this list ID.",
    ),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20_000).optional(),
    dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
    priority: z.number().int().min(0).max(5).optional(),
    done: z.boolean().optional(),
    links: z.array(z.object({
      label: z.string().trim().min(1).max(120),
      url: z.url().max(2_000),
    })).max(20).optional(),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ taskId, ...update }) =>
    truncateToolValue(await updateTask(taskId, update)) as Record<
      string,
      unknown
    >,
});

export const taskDeleteTool = createTool({
  id: "task_delete",
  description:
    "Permanently delete a task by numeric task ID. Only call after the user explicitly asks to delete it.",
  inputSchema: z.object({ taskId: z.number().int().positive() }),
  outputSchema: z.object({ deleted: z.boolean(), taskId: z.number() }),
  execute: async ({ taskId }) => {
    await deleteTask(taskId);
    return { deleted: true, taskId };
  },
});

const automationFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  description: z.string().min(1).max(500),
  valueType: z
    .enum(["text", "number", "date", "datetime", "boolean", "currency", "identifier"])
    .default("text"),
  multiple: z.boolean().default(false),
});

export const familyAutomationUpsertTool = createTool({
  id: "family_automation_upsert",
  description:
    "Create or amend a persistent ingestion automation. Use this when the user says things like 'every time a school requirement is found, update my todo list'. The extraction directive teaches the context stage what to find; the action rule creates or updates the task through Kestra.",
  inputSchema: z.object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/),
    description: z.string().min(1).max(500),
    recordKind: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
    extractionInstruction: z.string().min(1).max(4000),
    fields: z.array(automationFieldSchema).max(64).default([]),
    appliesToSources: z.array(z.string()).max(32).default([]),
    appliesToLabels: z.array(z.string()).max(32).default([]),
    priority: z.number().int().min(0).max(5).default(2),
    titlePrefix: z.string().max(100).default(""),
  }),
  outputSchema: z.object({
    directive: z.record(z.string(), z.unknown()),
    rule: z.record(z.string(), z.unknown()),
  }),
  execute: async (input) => {
    const directiveResponse = await familyContextRequest(
      `/v1/extraction-directives/${encodeURIComponent(input.name)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          description: input.description,
          instruction: input.extractionInstruction,
          record_kind: input.recordKind,
          applies_to_sources: input.appliesToSources,
          applies_to_labels: input.appliesToLabels,
          fields: input.fields.map((field) => ({
            name: field.name,
            description: field.description,
            value_type: field.valueType,
            multiple: field.multiple,
          })),
          enabled: true,
        }),
      },
    );
    const ruleResponse = await familyContextRequest(
      `/v1/automation-rules/${encodeURIComponent(input.name)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          description: input.description,
          record_kinds: [input.recordKind],
          action_type: "vikunja_task_upsert",
          action_config: {
            priority: input.priority,
            title_prefix: input.titlePrefix,
          },
          enabled: true,
        }),
      },
    );
    return {
      directive: (await directiveResponse.json()) as Record<string, unknown>,
      rule: (await ruleResponse.json()) as Record<string, unknown>,
    };
  },
});

export const familyAutomationListTool = createTool({
  id: "family_automation_list",
  description: "List the persistent extraction directives and downstream automation rules.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    directives: z.array(z.record(z.string(), z.unknown())),
    rules: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async () => {
    const [directives, rules] = await Promise.all([
      familyContextRequest("/v1/extraction-directives"),
      familyContextRequest("/v1/automation-rules"),
    ]);
    return {
      directives: (await directives.json()) as Array<Record<string, unknown>>,
      rules: (await rules.json()) as Array<Record<string, unknown>>,
    };
  },
});

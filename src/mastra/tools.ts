import { createTool } from "@mastra/core/tools";
import { CollectStreams, Monty } from "@pydantic/monty";
import { parse } from "pgsql-ast-parser";
import { Pool } from "pg";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import { truncateToolText, truncateToolValue } from "@/lib/tool-output";

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
    connectionTimeoutMillis: 5_000,
  }));
}

export const familySqlTool = createTool({
  id: "family_sql",
  description: `Run one read-only PostgreSQL SELECT generated for a family-context question.
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
      await client.query("SET LOCAL statement_timeout = '5s'");
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

export const familyGraphTool = createTool({
  id: "family_graph",
  description:
    "Search Graphiti's temporal family knowledge graph for entities, relationships, and facts derived from ingested family context. Use alongside family_sql when both structured records and semantic relationships can help.",
  inputSchema: z.object({
    query: z.string().min(1).max(2_000),
    maxFacts: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    query: z.string(),
    facts: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async ({ query, maxFacts }) => {
    if (!serverConfig.graphitiApiUrl) {
      throw new Error("GRAPHITI_API_URL is not configured.");
    }
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
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Graphiti search failed with HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as {
      facts?: Array<Record<string, unknown>>;
    };
    return { query, facts: payload.facts ?? [] };
  },
});

async function familyContextRequest(path: string) {
  if (!serverConfig.familyContextApiUrl || !serverConfig.familyContextApiKey) {
    throw new Error("The family context retrieval API is not configured.");
  }
  const response = await fetch(new URL(path, serverConfig.familyContextApiUrl), {
    headers: { "X-LFP-Context-Key": serverConfig.familyContextApiKey },
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

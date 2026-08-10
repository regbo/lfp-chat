import { createTool } from "@mastra/core/tools";
import { CollectStreams, Monty } from "@pydantic/monty";
import { z } from "zod";

const globalForMonty = globalThis as typeof globalThis & {
  lfpMontyPool?: Promise<Monty>;
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
  background: {
    enabled: true,
    timeoutMs: 30_000,
    maxRetries: 0,
  },
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
      result,
      stdout: streams.output
        .filter((entry) => entry.stream === "stdout")
        .map((entry) => entry.text)
        .join(""),
      stderr: streams.output
        .filter((entry) => entry.stream === "stderr")
        .map((entry) => entry.text)
        .join(""),
    };
  },
});

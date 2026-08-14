import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { executeMontyCode } from "@/lib/monty-runtime";

const projectKnowledge = [
  {
    title: "Mastra memory",
    text: "Conversation history and working memory are persisted in PostgreSQL and scoped by resource and thread IDs.",
  },
  {
    title: "Dashboard widgets",
    text: "Dashboard widgets persist Monty programs. On refresh they call explicitly allowed Mastra tools and render validated chart, metric, table, or text output without another model call.",
  },
  {
    title: "Rich tool events",
    text: "Mastra streams tool inputs, execution states, outputs, errors, reasoning, and text through the AI SDK compatibility bridge.",
  },
  {
    title: "Interface stack",
    text: "The client uses AI SDK useChat with AI Elements for messages, markdown, the composer, reasoning, and tool details.",
  },
];

export const searchTool = createTool({
  id: "search",
  description: "Search the app's built-in project knowledge.",
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(z.object({ title: z.string(), snippet: z.string(), score: z.number() })),
  }),
  execute: async ({ query }) => {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const results = projectKnowledge
      .map((entry) => ({
        title: entry.title,
        snippet: entry.text,
        score: terms.reduce(
          (score, term) => score + (`${entry.title} ${entry.text}`.toLowerCase().includes(term) ? 1 : 0),
          0,
        ),
      }))
      .toSorted((left, right) => right.score - left.score)
      .slice(0, 3);
    return { query, results };
  },
});

export const calculatorTool = createTool({
  id: "calculator",
  description: "Perform reliable basic arithmetic with two numbers.",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    left: z.number(),
    right: z.number(),
  }),
  outputSchema: z.object({ result: z.number() }),
  execute: async ({ operation, left, right }) => {
    if (operation === "divide" && right === 0) throw new Error("Cannot divide by zero.");
    return {
      result: {
        add: () => left + right,
        subtract: () => left - right,
        multiply: () => left * right,
        divide: () => left / right,
      }[operation](),
    };
  },
});

export const montyTool = createTool({
  id: "monty",
  description: "Execute self-contained Python in Monty's isolated, resource-limited sandbox.",
  inputSchema: z.object({ code: z.string().min(1).max(20_000) }),
  outputSchema: z.object({ result: z.unknown(), stdout: z.string(), stderr: z.string() }),
  execute: async ({ code }) => executeMontyCode(code),
});

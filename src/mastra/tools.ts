import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { executeMontyCode } from "@/lib/monty-runtime";

export const montyTool = createTool({
  id: "monty",
  description: "Execute self-contained Python in Monty's isolated, resource-limited sandbox.",
  inputSchema: z.object({ code: z.string().min(1).max(20_000) }),
  outputSchema: z.object({ result: z.unknown(), stdout: z.string(), stderr: z.string() }),
  execute: async ({ code }) => executeMontyCode(code),
});

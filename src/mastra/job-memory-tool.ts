import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { isScheduledThread } from "@/lib/thread-state";
import { truncateToolText } from "@/lib/tool-output";

function messageText(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!content || typeof content !== "object") return "";

  const parts = "parts" in content && Array.isArray(content.parts)
    ? content.parts
    : [];
  return parts
    .flatMap((part) => {
      if (!part || typeof part !== "object" || !("type" in part)) return [];
      if (part.type !== "text" || !("text" in part) || typeof part.text !== "string") {
        return [];
      }
      return [part.text];
    })
    .join("\n")
    .trim();
}

export const jobMemoryRecallTool = createTool({
  id: "job_memory_recall",
  description:
    "Recall prior outputs from this scheduled job's private thread. Use before producing content that must differ from earlier runs, continue prior work, or account for what this job already reported. Omit query when checking for duplicates so no prior output is accidentally excluded.",
  inputSchema: z.object({
    query: z.string().trim().max(200).optional().describe(
      "Optional words used to rank relevant prior outputs first. Omit for uniqueness checks.",
    ),
    page: z.number().int().min(0).max(1000).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    page: z.number().int(),
    hasMore: z.boolean(),
    outputs: z.array(z.object({
      createdAt: z.string(),
      text: z.string(),
    })),
  }),
  execute: async ({ query, page, limit }, context) => {
    const { agentId, resourceId, threadId } = context.agent ?? {};
    if (!context.mastra || !agentId || !resourceId || !threadId) {
      throw new Error("Job memory is only available inside a scheduled job run.");
    }

    const agent = context.mastra.getAgentById(agentId);
    const memory = await agent.getMemory({ requestContext: context.requestContext });
    if (!memory) throw new Error("This scheduled agent does not have memory configured.");

    const thread = await memory.getThreadById({ threadId });
    if (
      !thread ||
      thread.resourceId !== resourceId ||
      !isScheduledThread({ id: thread.id, metadata: thread.metadata })
    ) {
      throw new Error("Job memory cannot access an ordinary conversation.");
    }

    // Each run normally contributes a signal and an assistant message. Scan a
    // wider page so callers receive the requested number of actual job outputs.
    const recalled = await memory.recall({
      threadId,
      resourceId,
      page,
      perPage: limit * 3,
      orderBy: { field: "createdAt", direction: "DESC" },
    });
    const queryTerms = query?.toLocaleLowerCase("en-US").split(/\W+/).filter(Boolean) ?? [];
    const outputs = recalled.messages
      .filter((message) => message.role === "assistant")
      .map((message) => ({
        createdAt: message.createdAt.toISOString(),
        text: truncateToolText(messageText(message.content), 4_000),
      }))
      .filter((entry) => entry.text)
      .map((entry, index) => ({
        entry,
        index,
        score: queryTerms.reduce(
          (score, term) => score + (entry.text.toLocaleLowerCase("en-US").includes(term) ? 1 : 0),
          0,
        ),
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, limit)
      .map(({ entry }) => entry);

    return { page, hasMore: recalled.hasMore, outputs };
  },
});

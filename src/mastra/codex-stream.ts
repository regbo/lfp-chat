import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import { z } from "zod";

import { createCodexCli } from "@/mastra/codex-agent";
import { memory } from "@/mastra";
import { truncateToolValue } from "@/lib/tool-output";

const directCodexRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  runId: z.string().min(1),
  threadId: z.string().min(1),
  resourceId: z.string().min(1),
});

type StreamChunk = {
  type: string;
  runId: string;
  payload?: Record<string, unknown>;
};

type ToolState = {
  name: string;
  title: string;
  input?: unknown;
  output?: unknown;
};

const MAX_CONTEXT_MESSAGES = 16;
const MAX_CONTEXT_CHARS = 24_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.name === "string" && typeof value.url === "string") {
    return `[Attached file: ${value.name}]`;
  }
  return "";
}

function messageText(message: unknown): string {
  if (!isRecord(message)) return "";
  if (typeof message.content === "string") return message.content;
  const content = isRecord(message.content) ? message.content : undefined;
  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(content?.parts)
      ? content.parts
      : [];
  return parts.map(contentText).filter(Boolean).join("\n");
}

function currentUserText(messages: unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isRecord(message) && message.role === "user") {
      const text = messageText(message).trim();
      if (text) return text;
    }
  }
  return messageText(messages.at(-1)).trim();
}

function createTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}...` : compact;
}

function buildPrompt(
  userText: string,
  context: Awaited<ReturnType<typeof memory.getContext>>,
) {
  const history = context.messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => {
      const text = messageText(message).trim();
      return text ? `${message.role === "assistant" ? "Assistant" : "User"}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(-MAX_CONTEXT_CHARS);
  return [
    context.systemMessage ? `Mastra memory:\n${context.systemMessage}` : "",
    context.otherThreadsContext
      ? `Related conversation context:\n${context.otherThreadsContext}`
      : "",
    history ? `Recent conversation:\n${history}` : "",
    `Current user request:\n${userText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function dbMessage(options: {
  id: string;
  role: "user" | "assistant";
  text: string;
  threadId: string;
  resourceId: string;
}): MastraDBMessage {
  return {
    id: options.id,
    role: options.role,
    type: "text",
    createdAt: new Date(),
    threadId: options.threadId,
    resourceId: options.resourceId,
    content: { format: 2, parts: [{ type: "text", text: options.text }] },
  };
}

function updateText(update: Record<string, unknown>) {
  const content = update.content;
  return isRecord(content) && typeof content.text === "string" ? content.text : "";
}

function toolOutput(update: Record<string, unknown>) {
  if (update.rawOutput !== undefined) return truncateToolValue(update.rawOutput);
  if (!Array.isArray(update.content)) return undefined;
  const text = update.content
    .map((item) => {
      if (!isRecord(item)) return "";
      if (isRecord(item.content)) return contentText(item.content);
      return contentText(item);
    })
    .filter(Boolean)
    .join("\n");
  return text || truncateToolValue(update.content);
}

function mapPlan(update: Record<string, unknown>) {
  if (!Array.isArray(update.entries)) return "";
  const active = update.entries.find(
    (entry) => isRecord(entry) && entry.status === "in_progress",
  );
  return isRecord(active) && typeof active.content === "string"
    ? `Working on ${active.content}\n`
    : "";
}

export async function prepareDirectCodexRun(input: unknown) {
  const parsed = directCodexRequestSchema.parse(input);
  const userText = currentUserText(parsed.messages);
  if (!userText) throw new Error("A user message is required.");

  const existing = await memory.getThreadById({ threadId: parsed.threadId });
  if (existing && existing.resourceId !== parsed.resourceId) {
    throw new Error("Chat not found.");
  }
  if (!existing) {
    await memory.createThread({
      threadId: parsed.threadId,
      resourceId: parsed.resourceId,
      title: createTitle(userText) || "New chat",
    });
  }
  const context = await memory.getContext({
    threadId: parsed.threadId,
    resourceId: parsed.resourceId,
  });
  await memory.saveMessages({
    messages: [
      dbMessage({
        id: crypto.randomUUID(),
        role: "user",
        text: userText,
        threadId: parsed.threadId,
        resourceId: parsed.resourceId,
      }),
    ],
  });

  return {
    ...parsed,
    prompt: buildPrompt(userText, context),
  };
}

export async function streamDirectCodexRun(
  run: Awaited<ReturnType<typeof prepareDirectCodexRun>>,
  emit: (chunk: StreamChunk) => Promise<void>,
  signal?: AbortSignal,
) {
  const codex = createCodexCli();
  const tools = new Map<string, ToolState>();
  let assistantText = "";
  let textStarted = false;

  try {
    for await (const event of codex.connection.promptStream(run.prompt, signal)) {
      if (event.type === "text") {
        if (!textStarted) {
          textStarted = true;
          await emit({ type: "text-start", runId: run.runId });
        }
        assistantText += event.text;
        await emit({
          type: "text-delta",
          runId: run.runId,
          payload: { text: event.text },
        });
        continue;
      }

      const update = event.update as unknown as Record<string, unknown>;
      const kind = update.sessionUpdate;
      if (kind === "agent_thought_chunk") {
        const text = updateText(update);
        if (text) {
          await emit({
            type: "reasoning-delta",
            runId: run.runId,
            payload: { text },
          });
        }
      } else if (kind === "plan") {
        const text = mapPlan(update);
        if (text) {
          await emit({
            type: "reasoning-delta",
            runId: run.runId,
            payload: { text },
          });
        }
      } else if (kind === "tool_call") {
        const toolCallId = String(update.toolCallId ?? "");
        if (!toolCallId) continue;
        const state = {
          name: String(update.name ?? update.kind ?? "tool"),
          title: String(update.title ?? update.name ?? "Tool"),
          input: update.rawInput,
        };
        tools.set(toolCallId, state);
        await emit({
          type: "tool-call",
          runId: run.runId,
          payload: {
            toolCallId,
            toolName: state.title,
            args: state.input,
          },
        });
      } else if (kind === "tool_call_update") {
        const toolCallId = String(update.toolCallId ?? "");
        if (!toolCallId) continue;
        const previous = tools.get(toolCallId) ?? {
          name: "tool",
          title: String(update.title ?? update.name ?? "Tool"),
        };
        const state = {
          ...previous,
          name: String(update.name ?? previous.name),
          title: String(update.title ?? previous.title),
          input: update.rawInput ?? previous.input,
          output: toolOutput(update) ?? previous.output,
        };
        tools.set(toolCallId, state);
        if (update.status === "failed") {
          await emit({
            type: "tool-error",
            runId: run.runId,
            payload: {
              toolCallId,
              error: state.output ?? `${state.title} failed.`,
            },
          });
        } else if (update.status === "completed") {
          await emit({
            type: "tool-result",
            runId: run.runId,
            payload: { toolCallId, result: state.output },
          });
        }
      } else if (kind === "usage_update") {
        await emit({ type: "data-usage", runId: run.runId, payload: update });
      }
    }

    if (assistantText.trim()) {
      await memory.saveMessages({
        messages: [
          dbMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            text: assistantText,
            threadId: run.threadId,
            resourceId: run.resourceId,
          }),
        ],
      });
    }
    await emit({ type: "finish", runId: run.runId });
  } finally {
    codex.connection.disconnect();
  }
}

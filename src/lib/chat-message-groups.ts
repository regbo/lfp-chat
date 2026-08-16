import type { UIMessage } from "ai";

/**
 * Mastra stores each model step in a tool loop as a separate assistant message.
 * Present adjacent steps as one assistant turn while retaining the underlying
 * message records for streaming updates and persistence.
 */
export function groupConsecutiveAssistantMessages(messages: UIMessage[]) {
  const grouped: UIMessage[] = [];
  for (const message of messages) {
    const previous = grouped.at(-1);
    if (message.role !== "assistant" || previous?.role !== "assistant") {
      grouped.push(message);
      continue;
    }
    grouped[grouped.length - 1] = {
      ...message,
      id: previous.id,
      parts: [...previous.parts, ...message.parts],
    };
  }
  return grouped;
}

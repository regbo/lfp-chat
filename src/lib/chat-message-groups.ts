import type { UIMessage } from "ai";

const controllerTaskToolIds = new Set([
  "task_write",
  "task_update",
  "task_complete",
  "task_check",
]);

export function isControllerTaskToolPart(
  part: UIMessage["parts"][number],
) {
  if (part.type === "dynamic-tool") {
    return controllerTaskToolIds.has(part.toolName);
  }
  if (!part.type.startsWith("tool-")) return false;
  return controllerTaskToolIds.has(part.type.slice("tool-".length));
}

function hasRenderablePart(part: UIMessage["parts"][number]) {
  if (part.type === "text" || part.type === "reasoning") {
    return part.text.trim().length > 0;
  }
  // AgentController projects these calls into the dedicated Live work panel.
  // Rendering the raw JSON again in the transcript is noisy, and a task-only
  // model step otherwise becomes an empty chat bubble after suppression.
  if (isControllerTaskToolPart(part)) return false;
  return (
    part.type === "file" ||
    part.type === "dynamic-tool" ||
    part.type.startsWith("tool-")
  );
}

/** Remove persisted placeholders that would otherwise render as empty bubbles. */
export function filterRenderableMessages(messages: UIMessage[]) {
  return messages.filter((message) => message.parts.some(hasRenderablePart));
}

function messageSignature(message: UIMessage) {
  return JSON.stringify([
    message.role,
    message.parts.map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return [part.type, part.text.trim()];
      }
      if (part.type === "file") {
        return [part.type, part.mediaType, part.filename, part.url];
      }
      if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
        return [part.type, "toolCallId" in part ? part.toolCallId : undefined];
      }
      return [part.type];
    }),
  ]);
}

/**
 * Reconcile a polling snapshot without discarding locally emitted messages
 * that the persistence read has not observed yet.
 */
export function mergeHydratedMessages(
  current: UIMessage[],
  hydrated: UIMessage[],
) {
  const merged = [...hydrated];
  const ids = new Set(hydrated.map((message) => message.id));
  const signatures = new Set(hydrated.map(messageSignature));
  for (const message of current) {
    const signature = messageSignature(message);
    if (ids.has(message.id) || signatures.has(signature)) continue;
    merged.push(message);
    ids.add(message.id);
    signatures.add(signature);
  }
  return merged;
}

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

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

export type QueuedControllerFollowUp = {
  id: string;
  message: PromptInputMessage;
  requestContext: Record<string, unknown>;
  createdAt: string;
};

type QueueStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const STORAGE_PREFIX = "lfp-chat:controller-follow-ups:v1";

function storageKey(resourceId: string, threadId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(resourceId)}:${encodeURIComponent(threadId)}`;
}

function isQueuedFollowUp(value: unknown): value is QueuedControllerFollowUp {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QueuedControllerFollowUp>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    Boolean(candidate.message) &&
    typeof candidate.message?.text === "string" &&
    Array.isArray(candidate.message?.files) &&
    Boolean(candidate.requestContext) &&
    typeof candidate.requestContext === "object"
  );
}

export function loadControllerFollowUpQueue(
  resourceId: string,
  threadId: string,
  storage: QueueStorage,
) {
  try {
    const stored = storage.getItem(storageKey(resourceId, threadId));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isQueuedFollowUp) : [];
  } catch {
    return [];
  }
}

export function saveControllerFollowUpQueue(
  resourceId: string,
  threadId: string,
  queue: QueuedControllerFollowUp[],
  storage: QueueStorage,
) {
  try {
    if (queue.length === 0) {
      storage.removeItem(storageKey(resourceId, threadId));
      return;
    }
    storage.setItem(storageKey(resourceId, threadId), JSON.stringify(queue));
  } catch {
    // A storage failure must not prevent the in-memory queue from operating.
  }
}

export function reorderControllerFollowUps(
  queue: QueuedControllerFollowUp[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = queue.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0 || sourceId === targetId) return queue;
  const next = [...queue];
  const [source] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  if (!source || targetIndex < 0) return queue;
  next.splice(targetIndex, 0, source);
  return next;
}

export function insertControllerFollowUp(
  queue: QueuedControllerFollowUp[],
  item: QueuedControllerFollowUp,
  index = queue.length,
) {
  const next = queue.filter((candidate) => candidate.id !== item.id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

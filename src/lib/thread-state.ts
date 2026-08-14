export type ThreadSummary = {
  id: string;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export function isThreadPinned(thread: ThreadSummary) {
  return thread.metadata?.pinned === true;
}

export function isThreadArchived(thread: ThreadSummary) {
  return thread.metadata?.archived === true;
}

export function getThreadFolder(thread: ThreadSummary) {
  const folder = thread.metadata?.folder;
  return typeof folder === "string" && folder.trim() ? folder.trim() : undefined;
}

export function isScheduledThread(thread: ThreadSummary) {
  return thread.metadata?.schedule === true || thread.id.startsWith("schedule-");
}

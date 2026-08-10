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

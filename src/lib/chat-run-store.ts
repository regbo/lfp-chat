type ChatRunStore = {
  listeners: Set<() => void>;
  runningThreadIds: Set<string>;
};

const globalForChatRuns = globalThis as typeof globalThis & {
  lfpChatRunStore?: ChatRunStore;
};

const store =
  globalForChatRuns.lfpChatRunStore ??
  (globalForChatRuns.lfpChatRunStore = {
    listeners: new Set(),
    runningThreadIds: new Set(),
  });

export function getRunningThreadIds() {
  return store.runningThreadIds;
}

export function subscribeToChatRuns(listener: () => void) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function setChatRunState(threadId: string, running: boolean) {
  const next = new Set(store.runningThreadIds);
  if (running) next.add(threadId);
  else next.delete(threadId);

  if (next.size === store.runningThreadIds.size && next.has(threadId) === running) {
    return;
  }

  store.runningThreadIds = next;
  store.listeners.forEach((listener) => listener());
}

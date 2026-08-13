import type { Task, TaskLink, TaskList } from "@/lib/tasks";

export type TaskDuplicateReason = "source-link" | "title";

/**
 * Normalize user-authored labels without discarding meaningful letters or
 * numbers. This keeps duplicate checks stable across punctuation, casing, and
 * whitespace differences commonly produced by separate agent runs.
 */
export function normalizeTaskIdentity(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim().toLocaleLowerCase("en-US").replace(/\/+$/, "");
  }
}

function sourceUrls(links: readonly TaskLink[] | undefined) {
  return new Set((links ?? []).map((link) => normalizeSourceUrl(link.url)));
}

export function findDuplicateTaskList(
  lists: readonly TaskList[],
  name: string,
) {
  const identity = normalizeTaskIdentity(name);
  return lists.find((list) => normalizeTaskIdentity(list.name) === identity);
}

/**
 * Source identity is global because the same email or document should not
 * create one open task per list. Title identity is scoped to the destination
 * list so users may intentionally track similarly named work in separate lists.
 */
export function findDuplicateOpenTask(
  tasks: readonly Task[],
  input: { listId: number; title: string; links?: readonly TaskLink[] },
): { task: Task; reason: TaskDuplicateReason } | undefined {
  const inputSources = sourceUrls(input.links);
  if (inputSources.size) {
    const sourceMatch = tasks.find(
      (task) =>
        !task.done &&
        [...sourceUrls(task.links)].some((url) => inputSources.has(url)),
    );
    if (sourceMatch) return { task: sourceMatch, reason: "source-link" };
  }

  const titleIdentity = normalizeTaskIdentity(input.title);
  const titleMatch = tasks.find(
    (task) =>
      !task.done &&
      task.listId === input.listId &&
      normalizeTaskIdentity(task.title) === titleIdentity,
  );
  return titleMatch ? { task: titleMatch, reason: "title" } : undefined;
}

export function taskCreationLockKey(input: {
  listId: number;
  title: string;
  links?: readonly TaskLink[];
}) {
  const links = [...sourceUrls(input.links)].sort();
  return links.length
    ? `source:${links.join("|")}`
    : `title:${input.listId}:${normalizeTaskIdentity(input.title)}`;
}

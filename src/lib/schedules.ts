export const SCHEDULE_TIMEZONE_CONTEXT_KEY = "lfp.timezone";

export type ComparableSchedule = {
  id: string;
  agentId?: string;
  resourceId?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
};

function normalizeScheduleTask(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const taskStopWords = new Set([
  "a",
  "an",
  "brief",
  "concise",
  "create",
  "for",
  "generate",
  "make",
  "of",
  "please",
  "provide",
  "produce",
  "the",
  "to",
  "write",
]);

function canonicalTaskTokens(value: string) {
  return new Set(
    normalizeScheduleTask(value)
      .split(" ")
      .filter((token) => token && !taskStopWords.has(token))
      .map((token) => (token.startsWith("summar") ? "summary" : token)),
  );
}

function substantiallySameTask(left: string, right: string) {
  const leftTokens = canonicalTaskTokens(left);
  const rightTokens = canonicalTaskTokens(right);
  if (leftTokens.size < 2 || leftTokens.size !== rightTokens.size) return false;
  return [...leftTokens].every((token) => rightTokens.has(token));
}

/**
 * A stable task identity deliberately excludes cadence: an existing schedule
 * for the same work should be edited instead of duplicated at a new cadence.
 */
export function scheduleDedupeKey(input: {
  agentId: string;
  prompt: string;
  resourceId: string;
}) {
  return [input.resourceId, input.agentId, normalizeScheduleTask(input.prompt)].join("::");
}

export function findCoveringSchedule<T extends ComparableSchedule>(
  schedules: readonly T[],
  input: { agentId: string; prompt: string; resourceId: string },
  excludeId?: string,
) {
  const key = scheduleDedupeKey(input);
  const normalizedPrompt = normalizeScheduleTask(input.prompt);

  return schedules.find((schedule) => {
    if (schedule.id === excludeId) return false;
    if (schedule.agentId !== input.agentId) return false;
    if (schedule.resourceId !== input.resourceId) return false;
    return (
      schedule.metadata?.dedupeKey === key ||
      (typeof schedule.prompt === "string" &&
        (normalizeScheduleTask(schedule.prompt) === normalizedPrompt ||
          substantiallySameTask(schedule.prompt, input.prompt)))
    );
  });
}

export function scheduleRequestContext(input: {
  enabledToolIds: readonly string[];
  modelId?: string;
  reasoningEffort?: string | null;
  timezone: string;
}) {
  return {
    // Scheduled runs should do their assigned work, not recursively manage
    // the scheduler that launched them.
    "lfp.tools": input.enabledToolIds.filter((id) => id !== "scheduling"),
    "lfp.timezone": input.timezone,
    ...(input.modelId ? { "lfp.model": input.modelId } : {}),
    ...(input.reasoningEffort !== undefined
      ? { "lfp.reasoning": input.reasoningEffort }
      : {}),
  };
}

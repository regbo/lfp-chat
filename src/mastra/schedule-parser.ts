import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { Cron } from "croner";
import { z } from "zod";

import { resolveRuntimeModel } from "@/mastra/model-provider";

const parsedScheduleSchema = z.object({
  cron: z.string().trim().min(1).max(100).describe(
    "A valid five-part Unix cron expression. Use numeric weekdays where Sunday is 0 and Saturday is 6.",
  ),
  timezone: z.string().trim().min(1).max(100).describe(
    "An IANA timezone such as America/New_York.",
  ),
  description: z.string().trim().min(1).max(200).describe(
    "A concise human-readable explanation of when the schedule runs.",
  ),
});

export type ParsedSchedule = z.infer<typeof parsedScheduleSchema>;

export function isCronExpression(value: string) {
  try {
    new Cron(value.trim(), { paused: true });
    return true;
  } catch {
    return false;
  }
}

function assertCronExpression(value: string) {
  if (!isCronExpression(value)) {
    throw new Error(`“${value}” is not a valid cron expression.`);
  }
}

function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`“${timezone}” is not a valid IANA timezone.`);
  }
}

const scheduleParserAgent = new Agent({
  id: "scheduleParser",
  name: "Schedule parser",
  description: "Converts natural recurrence descriptions into validated cron data.",
  model: ({ requestContext }) => resolveRuntimeModel(requestContext),
  instructions: `Convert a natural-language recurring schedule into a five-part Unix cron expression.

Rules:
- Fields are minute, hour, day of month, month, and weekday.
- Sunday is 0 and Saturday is 6.
- Use the supplied timezone unless the input explicitly names another timezone.
- If no time is supplied, use 09:00.
- Return only the structured result requested by the schema.`,
});

async function parseSchedule(
  input: { schedule: string; timezone: string },
  requestContext: RequestContext,
): Promise<ParsedSchedule> {
  const schedule = input.schedule.trim();
  assertTimezone(input.timezone);
  if (isCronExpression(schedule)) {
    return {
      cron: schedule,
      timezone: input.timezone,
      description: `Cron: ${schedule}`,
    };
  }

  const response = await scheduleParserAgent.generate(
    `Schedule: ${schedule}\nDefault timezone: ${input.timezone}`,
    {
      maxSteps: 1,
      modelSettings: { maxOutputTokens: 200, temperature: 0 },
      requestContext,
      structuredOutput: {
        schema: parsedScheduleSchema,
        jsonPromptInjection: "auto",
      },
    },
  );
  const parsed = parsedScheduleSchema.parse(response.object);
  assertCronExpression(parsed.cron);
  assertTimezone(parsed.timezone);
  return parsed;
}

export const scheduleParseTool = createTool({
  id: "schedule_parse",
  description:
    "Parse a plain-language recurrence or pass through a cron expression, returning validated cron, timezone, and a readable description.",
  inputSchema: z.object({
    schedule: z.string().trim().min(1).max(300),
    timezone: z.string().trim().min(1).max(100),
  }),
  outputSchema: parsedScheduleSchema,
  execute: async (input, context) => parseSchedule(input, context.requestContext),
});

export function parseScheduleInput(
  input: { schedule: string; timezone: string },
  requestContext: RequestContext,
) {
  return parseSchedule(input, requestContext);
}

export async function generateScheduleName(
  prompt: string,
  requestContext: RequestContext,
) {
  const fallback = prompt.trim().replace(/\s+/g, " ").slice(0, 80) || "Scheduled job";
  try {
    const generated = await scheduleParserAgent.generateTitleFromUserMessage({
      message: prompt,
      requestContext,
    });
    return generated?.trim().slice(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

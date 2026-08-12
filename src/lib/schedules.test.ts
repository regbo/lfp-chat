import { describe, expect, test } from "bun:test";

import {
  findCoveringSchedule,
  scheduleDedupeKey,
  scheduleRequestContext,
} from "./schedules";

describe("schedule duplicate detection", () => {
  test("treats formatting and case variants as the same task", () => {
    const schedules = [{
      id: "one",
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "Create a summary of XYZ.",
    }];

    expect(findCoveringSchedule(schedules, {
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "  create A SUMMARY of xyz! ",
    })?.id).toBe("one");
  });

  test("recognizes concise paraphrases of the same recurring work", () => {
    const schedules = [{
      id: "one",
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "Create a concise summary of school announcements and deadlines.",
    }];
    expect(findCoveringSchedule(schedules, {
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "Summarize school announcements and deadlines",
    })?.id).toBe("one");
  });

  test("uses a stored key and excludes the schedule being edited", () => {
    const input = {
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "Review upcoming deadlines",
    };
    const schedules = [{
      id: "one",
      ...input,
      metadata: { dedupeKey: scheduleDedupeKey(input) },
    }];

    expect(findCoveringSchedule(schedules, input)?.id).toBe("one");
    expect(findCoveringSchedule(schedules, input, "one")).toBeUndefined();
  });

  test("keeps users and agents isolated", () => {
    const schedules = [{
      id: "one",
      agentId: "chatAgent",
      resourceId: "another-user",
      prompt: "Create a summary of xyz",
    }];
    expect(findCoveringSchedule(schedules, {
      agentId: "chatAgent",
      resourceId: "family",
      prompt: "Create a summary of xyz",
    })).toBeUndefined();
  });
});

test("scheduled runs keep work tools but cannot recursively schedule", () => {
  expect(scheduleRequestContext({
    enabledToolIds: ["family_search", "scheduling"],
    timezone: "America/New_York",
  })).toEqual({
    "lfp.tools": ["family_search"],
    "lfp.timezone": "America/New_York",
  });
});

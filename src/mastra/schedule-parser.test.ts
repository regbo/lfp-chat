import { describe, expect, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";

import { isCronExpression, parseScheduleInput } from "./schedule-parser";

describe("schedule parser", () => {
  test("does not mistake a five-word schedule for cron", () => {
    expect(isCronExpression("every Tuesday at 9 AM")).toBe(false);
    expect(isCronExpression("0 9 * * 2")).toBe(true);
  });

  test("passes standard cron through without a model call", async () => {
    await expect(parseScheduleInput(
      { schedule: "0 9 * * 2", timezone: "America/New_York" },
      new RequestContext(),
    )).resolves.toEqual({
      cron: "0 9 * * 2",
      timezone: "America/New_York",
      description: "Cron: 0 9 * * 2",
    });
  });

  test("rejects an invalid timezone before parsing", async () => {
    await expect(parseScheduleInput(
      { schedule: "0 9 * * 2", timezone: "Mars/Olympus" },
      new RequestContext(),
    )).rejects.toThrow("not a valid IANA timezone");
  });
});

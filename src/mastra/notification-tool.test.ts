import { describe, expect, test } from "bun:test";

import { notificationTargetSchema } from "./notification-tool";

describe("notification destination", () => {
  test("defaults to the home view", () => {
    expect(notificationTargetSchema.parse(undefined)).toBe("/");
  });

  test.each([
    "/",
    "/tasks",
    "/search?q=permission",
    "https://example.com/result",
    "http://example.test/result",
  ])("accepts %s", (url) => {
    expect(notificationTargetSchema.parse(url)).toBe(url);
  });

  test.each([
    "scheduled",
    "//example.com/result",
    "javascript:alert(1)",
    "mailto:person@example.com",
    "",
  ])("rejects %s", (url) => {
    expect(notificationTargetSchema.safeParse(url).success).toBe(false);
  });
});

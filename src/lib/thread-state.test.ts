import { describe, expect, test } from "bun:test";

import { isScheduledThread } from "./thread-state";

describe("scheduled thread classification", () => {
  test("recognizes schedule metadata", () => {
    expect(isScheduledThread({ id: "custom-id", metadata: { schedule: true } })).toBe(true);
  });

  test("recognizes legacy schedule-prefixed threads", () => {
    expect(isScheduledThread({ id: "schedule-existing-id" })).toBe(true);
  });

  test("keeps ordinary chats in conversation history", () => {
    expect(isScheduledThread({ id: "chat-id", metadata: { schedule: false } })).toBe(false);
  });
});

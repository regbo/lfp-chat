import { describe, expect, test } from "bun:test";

import { getThreadFolder, isScheduledThread } from "./thread-state";

describe("thread folders", () => {
  test("reads a normalized folder name from metadata", () => {
    expect(getThreadFolder({ id: "chat-id", metadata: { folder: " Family " } })).toBe("Family");
  });

  test("ignores missing and invalid folder values", () => {
    expect(getThreadFolder({ id: "chat-id", metadata: { folder: false } })).toBeUndefined();
    expect(getThreadFolder({ id: "chat-id", metadata: { folder: "  " } })).toBeUndefined();
  });
});

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

import { describe, expect, test } from "bun:test";

import {
  findDuplicateOpenTask,
  findDuplicateTaskList,
  normalizeTaskIdentity,
} from "./task-dedupe";

describe("task duplicate detection", () => {
  test("normalizes punctuation, casing, ampersands, and whitespace", () => {
    expect(normalizeTaskIdentity("  Forms & Fees: 2026! ")).toBe(
      "forms and fees 2026",
    );
  });

  test("finds an existing list by normalized name", () => {
    const existing = findDuplicateTaskList(
      [{ id: 7, name: "School & Activities" }],
      "school and activities",
    );
    expect(existing?.id).toBe(7);
  });

  test("matches an open task title only within its destination list", () => {
    const tasks = [
      { id: 10, listId: 3, title: "Submit permission form", done: false },
    ];
    expect(
      findDuplicateOpenTask(tasks, {
        listId: 3,
        title: "Submit: Permission Form!",
      })?.task.id,
    ).toBe(10);
    expect(
      findDuplicateOpenTask(tasks, {
        listId: 4,
        title: "Submit permission form",
      }),
    ).toBeUndefined();
  });

  test("matches the same source across lists and ignores completed work", () => {
    const source = "https://mail.example/messages/123?b=2&a=1#details";
    const tasks = [
      {
        id: 11,
        listId: 2,
        title: "Old completed task",
        done: true,
        links: [{ label: "Email", url: source }],
      },
      {
        id: 12,
        listId: 5,
        title: "Current task",
        done: false,
        links: [{ label: "Source", url: source }],
      },
    ];
    const duplicate = findDuplicateOpenTask(tasks, {
      listId: 9,
      title: "Different wording",
      links: [{ label: "Original", url: "https://mail.example/messages/123?a=1&b=2" }],
    });
    expect(duplicate).toEqual({ task: tasks[1], reason: "source-link" });
  });
});

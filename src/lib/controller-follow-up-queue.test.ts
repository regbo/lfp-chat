import { describe, expect, test } from "bun:test";

import {
  insertControllerFollowUp,
  loadControllerFollowUpQueue,
  reorderControllerFollowUps,
  saveControllerFollowUpQueue,
  type QueuedControllerFollowUp,
} from "@/lib/controller-follow-up-queue";

function followUp(id: string): QueuedControllerFollowUp {
  return {
    id,
    message: { text: `Message ${id}`, files: [] },
    requestContext: { model: "test" },
    createdAt: "2026-08-16T00:00:00.000Z",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("controller follow-up queue", () => {
  test("persists valid queue entries and clears empty queues", () => {
    const storage = memoryStorage();
    saveControllerFollowUpQueue("resource", "thread", [followUp("one")], storage);
    expect(loadControllerFollowUpQueue("resource", "thread", storage)).toEqual([
      followUp("one"),
    ]);

    saveControllerFollowUpQueue("resource", "thread", [], storage);
    expect(loadControllerFollowUpQueue("resource", "thread", storage)).toEqual([]);
  });

  test("ignores malformed stored entries", () => {
    const storage = memoryStorage();
    storage.setItem(
      "lfp-chat:controller-follow-ups:v1:resource:thread",
      JSON.stringify([followUp("valid"), { id: "invalid" }]),
    );
    expect(loadControllerFollowUpQueue("resource", "thread", storage)).toEqual([
      followUp("valid"),
    ]);
  });

  test("reorders and restores entries without duplication", () => {
    const one = followUp("one");
    const two = followUp("two");
    const three = followUp("three");
    expect(reorderControllerFollowUps([one, two, three], "three", "one"))
      .toEqual([three, one, two]);
    expect(insertControllerFollowUp([one, three], two, 1)).toEqual([
      one,
      two,
      three,
    ]);
    expect(insertControllerFollowUp([one, two], two, 0)).toEqual([two, one]);
  });
});

import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  filterRenderableMessages,
  groupConsecutiveAssistantMessages,
  mergeHydratedMessages,
} from "@/lib/chat-message-groups";

const message = (
  id: string,
  role: UIMessage["role"],
  text: string,
): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

describe("groupConsecutiveAssistantMessages", () => {
  test("links adjacent tool-loop fragments into one stable assistant turn", () => {
    const grouped = groupConsecutiveAssistantMessages([
      message("user-1", "user", "Find my latest email"),
      message("assistant-1", "assistant", "Searching"),
      message("assistant-2", "assistant", "Summarizing"),
      message("assistant-3", "assistant", "Here is the answer"),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[1]?.id).toBe("assistant-1");
    expect(grouped[1]?.parts).toEqual([
      { type: "text", text: "Searching" },
      { type: "text", text: "Summarizing" },
      { type: "text", text: "Here is the answer" },
    ]);
  });

  test("starts a new group after each user message", () => {
    const grouped = groupConsecutiveAssistantMessages([
      message("assistant-1", "assistant", "First answer"),
      message("user-1", "user", "Follow up"),
      message("assistant-2", "assistant", "Second answer"),
    ]);

    expect(grouped.map(({ id }) => id)).toEqual([
      "assistant-1",
      "user-1",
      "assistant-2",
    ]);
  });

  test("removes empty persisted bubbles while retaining visible message parts", () => {
    const empty = message("user-empty", "user", "   ");
    const attachment: UIMessage = {
      id: "user-file",
      role: "user",
      parts: [{ type: "file", mediaType: "text/plain", url: "data:,hello" }],
    };

    expect(filterRenderableMessages([
      empty,
      message("assistant-empty", "assistant", ""),
      message("assistant-visible", "assistant", "Answer"),
      attachment,
    ]).map(({ id }) => id)).toEqual(["assistant-visible", "user-file"]);
  });

  test("suppresses task-only controller steps from the chat transcript", () => {
    const taskOnly = {
      id: "assistant-task",
      role: "assistant",
      parts: [{
        type: "dynamic-tool",
        toolName: "task_write",
        toolCallId: "task-call",
        state: "output-available",
        input: { tasks: [] },
        output: { tasks: [], isError: false },
      }],
    } as UIMessage;
    const dashboardTool = {
      id: "assistant-dashboard",
      role: "assistant",
      parts: [{
        type: "dynamic-tool",
        toolName: "dashboard_upsert_tool",
        toolCallId: "dashboard-call",
        state: "input-available",
        input: { name: "earthquake_pulse" },
      }],
    } as UIMessage;

    expect(filterRenderableMessages([taskOnly, dashboardTool]).map(({ id }) => id))
      .toEqual(["assistant-dashboard"]);
  });

  test("keeps optimistic messages until polling observes their persisted copy", () => {
    const optimistic = message("local-user", "user", "Queued follow-up");
    expect(mergeHydratedMessages([optimistic], [])).toEqual([optimistic]);

    const persisted = message("server-user", "user", "Queued follow-up");
    expect(mergeHydratedMessages([optimistic], [persisted])).toEqual([persisted]);
  });
});

import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { groupConsecutiveAssistantMessages } from "@/lib/chat-message-groups";

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
});

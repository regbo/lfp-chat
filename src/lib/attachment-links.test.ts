import { describe, expect, test } from "bun:test";

import { formatAttachmentLinks } from "@/lib/attachment-links";

const attachmentToolOutput = {
  attachment_id: "54ca3e31-112f-4a6d-8a9c-e1ee4ac8d18f",
  filename: "Requested Record.pdf",
};

const attachmentTool = {
  type: "tool-file_download",
  state: "output-available",
  input: {},
  output: attachmentToolOutput,
  toolCallId: "tool-1",
} as never;

describe("attachment links", () => {
  test("links a plain attachment filename from tool output", () => {
    expect(formatAttachmentLinks("**PDF:** Requested Record.pdf", [attachmentTool])).toBe(
      "**PDF:** [Requested Record.pdf](/api/attachments/54ca3e31-112f-4a6d-8a9c-e1ee4ac8d18f/download)",
    );
  });

  test("recognizes attachment search results", () => {
    const search = {
      type: "tool-document_search",
      state: "output-available",
      input: {},
      output: {
        results: [{
          kind: "attachment",
          item_id: "54ca3e31-112f-4a6d-8a9c-e1ee4ac8d18f",
          title: "Requested Record.pdf",
        }],
      },
      toolCallId: "tool-2",
    } as never;
    expect(formatAttachmentLinks("Requested Record.pdf", [search])).toContain(
      "](/api/attachments/54ca3e31-112f-4a6d-8a9c-e1ee4ac8d18f/download)",
    );
  });

  test("does not alter an existing Markdown link or inline code", () => {
    const text = "[Requested Record.pdf](/existing) and `Requested Record.pdf`";
    expect(formatAttachmentLinks(text, [attachmentTool])).toBe(text);
  });
});

import { describe, expect, test } from "bun:test";

import {
  cleanTaskTitle,
  decodeTaskDescription,
  encodeTaskDescription,
} from "@/lib/task-metadata";

describe("task metadata", () => {
  test("round-trips tags and links without exposing metadata in notes", () => {
    const encoded = encodeTaskDescription(
      "Bring the signed form.",
      [{ label: "Email", url: "https://example.com/mail/1" }],
      ["School"],
    );

    expect(decodeTaskDescription(encoded)).toEqual({
      description: "Bring the signed form.",
      links: [{ label: "Email", url: "https://example.com/mail/1" }],
      tags: ["School"],
    });
  });

  test("keeps links written by the legacy codec", () => {
    const legacy = 'Notes\n\n<!-- lfp-chat:task-links [{"label":"Form","url":"https://example.com/form"}] -->';
    expect(decodeTaskDescription(legacy)).toEqual({
      description: "Notes",
      links: [{ label: "Form", url: "https://example.com/form" }],
      tags: [],
    });
  });

  test("turns recognized prefixes into tags but preserves ordinary titles", () => {
    expect(cleanTaskTitle("School: Submit permission slip")).toEqual({
      title: "Submit permission slip",
      tags: ["School"],
    });
    expect(cleanTaskTitle("Reminder: call the dentist")).toEqual({
      title: "Reminder: call the dentist",
      tags: [],
    });
  });
});

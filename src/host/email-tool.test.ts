import { describe, expect, mock, test } from "bun:test";

import {
  createEmailSendTool,
  emailSendInputSchema,
  renderMarkdownEmail,
  sendMarkdownEmail,
  type SmtpConfig,
} from "@/host/email-tool";

const smtpConfig: SmtpConfig = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  requireTls: true,
  user: "smtp-user",
  password: "smtp-password",
};

describe("email_send", () => {
  test("requires Mastra approval and does not expose the sender as input", () => {
    const tool = createEmailSendTool(smtpConfig);

    expect(tool.requireApproval).toBe(true);
    expect(emailSendInputSchema.safeParse({
      from: "attacker@example.com",
      to: ["family@example.com"],
      subject: "School update",
      markdown: "**Reminder:** Friday is a half day.",
    }).success).toBe(true);
    expect(Object.keys(emailSendInputSchema.shape)).not.toContain("from");
  });

  test("renders Markdown and neutralizes raw HTML and unsafe links", async () => {
    const rendered = await renderMarkdownEmail(
      "# Update\n\n<script>alert('x')</script>\n\n[bad](javascript:alert('x'))",
      "School update",
    );

    expect(rendered.html).toContain("<h1");
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.text).toContain("UPDATE");
  });

  test("sends from the fixed Home address through the configured transport", async () => {
    const sendMail = mock(async (message: unknown) => {
      expect(message).toBeDefined();
      return {
        messageId: "message-1",
        accepted: ["family@example.com"],
        rejected: [],
      };
    });
    const close = mock(() => undefined);

    const result = await sendMarkdownEmail(
      smtpConfig,
      {
        to: ["family@example.com"],
        subject: "School update",
        markdown: "**Reminder:** Friday is a half day.",
      },
      () => ({ sendMail, close }),
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: { name: "LFP Home", address: "no-reply@home.lfpconnect.io" },
      to: ["family@example.com"],
      subject: "School update",
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      messageId: "message-1",
      accepted: ["family@example.com"],
      rejected: [],
    });
  });
});

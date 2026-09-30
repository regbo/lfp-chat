import {
  Body,
  Container,
  Head,
  Html,
  Markdown,
  Preview,
} from "@react-email/components";
import { render } from "@react-email/render";
import { createTool } from "@mastra/core/tools";
import nodemailer from "nodemailer";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { secretValue } from "@/lib/config";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

const EMAIL_FROM = "no-reply@home.lfpconnect.io";
const EMAIL_FROM_NAME = "LFP Home";

const emailAddressSchema = z.email().max(320);

export const emailSendInputSchema = z.object({
  to: z.array(emailAddressSchema).min(1).max(50),
  cc: z.array(emailAddressSchema).max(50).optional(),
  bcc: z.array(emailAddressSchema).max(50).optional(),
  subject: z.string().trim().min(1).max(200),
  markdown: z.string().trim().min(1).max(100_000),
});

const emailSendOutputSchema = z.object({
  messageId: z.string(),
  accepted: z.array(z.string()),
  rejected: z.array(z.string()),
});

export type EmailSendInput = z.infer<typeof emailSendInputSchema>;

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  password: string;
};

type MailTransport = {
  sendMail: (message: {
    from: { name: string; address: string };
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
    text: string;
  }) => Promise<{
    messageId: string;
    accepted: unknown[];
    rejected: unknown[];
  }>;
  close: () => void;
};

type MailTransportFactory = (config: SmtpConfig) => MailTransport;

function parseSecretBoolean(name: string, value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

function parseSecretPort(value: string | undefined) {
  if (!value) return 587;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LFP_HOME_SMTP_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

export function smtpConfigFromEnvironment(): SmtpConfig | undefined {
  const host = secretValue("LFP_HOME_SMTP_HOST", "LFP_HOME_SMTP_HOST_FILE");
  const user = secretValue("LFP_HOME_SMTP_USER", "LFP_HOME_SMTP_USER_FILE");
  const password = secretValue(
    "LFP_HOME_SMTP_PASSWORD",
    "LFP_HOME_SMTP_PASSWORD_FILE",
  );
  const port = secretValue("LFP_HOME_SMTP_PORT", "LFP_HOME_SMTP_PORT_FILE");
  const secure = secretValue(
    "LFP_HOME_SMTP_USE_TLS",
    "LFP_HOME_SMTP_USE_TLS_FILE",
  );
  const requireTls = secretValue(
    "LFP_HOME_SMTP_START_TLS",
    "LFP_HOME_SMTP_START_TLS_FILE",
  );

  if (![host, user, password].some(Boolean)) return undefined;
  if (!host || !user || !password) {
    throw new Error("SMTP host, user, and password must be configured together.");
  }

  return {
    host,
    user,
    password,
    port: parseSecretPort(port),
    secure: parseSecretBoolean("LFP_HOME_SMTP_USE_TLS", secure, false),
    requireTls: parseSecretBoolean("LFP_HOME_SMTP_START_TLS", requireTls, true),
  };
}

const bodyStyle = {
  backgroundColor: "#f5f7fa",
  color: "#172033",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: "0",
  padding: "24px 12px",
};

const containerStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #dfe4ec",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "640px",
  padding: "28px",
};

const markdownStyles = {
  h1: { fontSize: "28px", lineHeight: "1.25", margin: "0 0 20px" },
  h2: { fontSize: "22px", lineHeight: "1.3", margin: "24px 0 12px" },
  h3: { fontSize: "18px", lineHeight: "1.35", margin: "20px 0 10px" },
  p: { fontSize: "16px", lineHeight: "1.6", margin: "0 0 16px" },
  li: { fontSize: "16px", lineHeight: "1.6", marginBottom: "6px" },
  link: { color: "#155eef", textDecoration: "underline" },
  codeInline: {
    backgroundColor: "#eef2f7",
    borderRadius: "4px",
    fontFamily: "Consolas, monospace",
    padding: "2px 4px",
  },
};

function EmailDocument({ markdown, subject }: { markdown: string; subject: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Markdown markdownCustomStyles={markdownStyles}>{markdown}</Markdown>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderMarkdownEmail(markdown: string, subject: string) {
  // React Email's Markdown renderer permits raw HTML, so neutralize it before rendering.
  const safeMarkdown = markdown.replaceAll("<", "&lt;");
  const rendered = await render(
    <EmailDocument markdown={safeMarkdown} subject={subject} />,
  );
  const html = sanitizeHtml(rendered, {
    allowedTags: [
      "html", "head", "body", "meta", "title", "div", "table", "thead",
      "tbody", "tr", "th", "td", "p", "h1", "h2", "h3", "h4", "h5",
      "h6", "strong", "em", "blockquote", "pre", "code", "ul", "ol",
      "li", "a", "br", "hr", "img", "del",
    ],
    allowedAttributes: {
      "*": ["style", "align"],
      html: ["lang", "dir"],
      meta: ["name", "content", "http-equiv", "charset"],
      a: ["href", "target", "title", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      ol: ["start"],
      table: ["role", "width", "cellpadding", "cellspacing", "border"],
      td: ["width", "valign", "bgcolor"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid"],
    allowProtocolRelative: false,
  });
  const text = await render(
    <Markdown markdownCustomStyles={markdownStyles}>{safeMarkdown}</Markdown>,
    { plainText: true },
  );
  return { html, text };
}

function addressText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "address" in value) {
    return String(value.address);
  }
  return String(value);
}

function defaultTransportFactory(config: SmtpConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: { user: config.user, pass: config.password },
  }) as MailTransport;
}

export async function sendMarkdownEmail(
  config: SmtpConfig,
  input: EmailSendInput,
  transportFactory: MailTransportFactory = defaultTransportFactory,
) {
  const { html, text } = await renderMarkdownEmail(input.markdown, input.subject);
  const transport = transportFactory(config);
  try {
    const result = await transport.sendMail({
      from: { name: EMAIL_FROM_NAME, address: EMAIL_FROM },
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html,
      text,
    });
    return {
      messageId: result.messageId,
      accepted: result.accepted.map(addressText),
      rejected: result.rejected.map(addressText),
    };
  } finally {
    transport.close();
  }
}

export function createEmailSendTool(config: SmtpConfig) {
  return createTool({
    id: "email_send",
    description:
      "Send an email from no-reply@home.lfpconnect.io after the user reviews and approves the exact recipients, subject, and Markdown body. Never use this tool without explicit user intent to send an email.",
    inputSchema: emailSendInputSchema,
    outputSchema: emailSendOutputSchema,
    requireApproval: true,
    execute: async (input) => sendMarkdownEmail(config, input),
  });
}

const smtpConfig = smtpConfigFromEnvironment();

export const homeEmailTools: LfpChatToolRegistryOverrides = smtpConfig
  ? {
      email: {
        title: "Email",
        description: "Send approval-gated Markdown email from the Home no-reply address.",
        hidden: false,
        enabled: true,
        userConfigurable: false,
        tools: { email_send: createEmailSendTool(smtpConfig) },
      },
    }
  : {};

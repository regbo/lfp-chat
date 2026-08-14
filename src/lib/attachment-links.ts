import type { ToolPart } from "@/components/ai-elements/tool";

const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTECTED_MARKDOWN = /(```[\s\S]*?```|`[^`\n]+`|\[[^\]]*\]\([^)]+\))/g;

type AttachmentLink = { filename: string; url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function attachmentFromRecord(value: Record<string, unknown>): AttachmentLink | undefined {
  const attachmentId =
    typeof value.attachment_id === "string"
      ? value.attachment_id
      : value.kind === "attachment" && typeof value.item_id === "string"
        ? value.item_id
        : undefined;
  const filename =
    typeof value.filename === "string"
      ? value.filename
      : value.kind === "attachment" && typeof value.title === "string"
        ? value.title
        : undefined;

  if (!attachmentId || !ATTACHMENT_ID.test(attachmentId) || !filename?.trim()) {
    return undefined;
  }
  return {
    filename: filename.trim(),
    url: `/api/attachments/${attachmentId}/download`,
  };
}

function collectAttachmentLinks(value: unknown, links: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentLinks(item, links);
    return;
  }
  if (!isRecord(value)) return;

  const attachment = attachmentFromRecord(value);
  if (attachment) links.set(attachment.filename, attachment.url);
  for (const item of Object.values(value)) collectAttachmentLinks(item, links);
}

function toolOutput(part: ToolPart): unknown {
  return "output" in part ? part.output : undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\\\[\]]/g, "\\$&");
}

function linkPlainSegment(segment: string, links: AttachmentLink[]) {
  return links.reduce((text, attachment) => {
    const pattern = new RegExp(escapeRegExp(attachment.filename), "g");
    return text.replace(
      pattern,
      () => `[${escapeMarkdownLabel(attachment.filename)}](${attachment.url})`,
    );
  }, segment);
}

/** Makes filenames returned by family tools downloadable, including in older chat messages. */
export function formatAttachmentLinks(text: string, tools: ToolPart[]) {
  const discovered = new Map<string, string>();
  for (const part of tools) collectAttachmentLinks(toolOutput(part), discovered);
  const links = [...discovered]
    .map(([filename, url]) => ({ filename, url }))
    .sort((left, right) => right.filename.length - left.filename.length);
  if (links.length === 0) return text;

  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(PROTECTED_MARKDOWN)) {
    const index = match.index ?? 0;
    result += linkPlainSegment(text.slice(cursor, index), links);
    result += match[0];
    cursor = index + match[0].length;
  }
  return result + linkPlainSegment(text.slice(cursor), links);
}

import type { TaskLink } from "@/lib/tasks";

const metadataMarker = /\n?<!-- lfp-chat:task-meta (\{[^\n]*\}) -->\s*$/;
const legacyLinksMarker = /\n?<!-- lfp-chat:task-links (\[[\s\S]*?\]) -->\s*$/;
const categoryPrefixes = new Set([
  "school",
  "home",
  "family",
  "work",
  "health",
  "finance",
  "errand",
  "chores",
  "kids",
]);

export type TaskMetadata = {
  description: string;
  links: TaskLink[];
  tags: string[];
};

/** Reads app metadata while remaining compatible with the original links-only marker. */
export function decodeTaskDescription(value = ""): TaskMetadata {
  const metadataMatch = value.match(metadataMarker);
  const legacyMatch = value.match(legacyLinksMarker);
  const match = metadataMatch ?? legacyMatch;
  if (!match) return { description: value, links: [], tags: [] };
  try {
    const parsed = JSON.parse(match[1]!) as unknown;
    const links = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "links" in parsed
        ? (parsed as { links?: unknown }).links
        : [];
    const tags = !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null && "tags" in parsed
      ? (parsed as { tags?: unknown }).tags
      : [];
    return {
      description: value.replace(metadataMarker, "").replace(legacyLinksMarker, "").trimEnd(),
      links: Array.isArray(links)
        ? links.filter((link): link is TaskLink =>
            typeof link?.label === "string" && typeof link?.url === "string")
        : [],
      tags: Array.isArray(tags)
        ? tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    };
  } catch {
    return { description: value, links: [], tags: [] };
  }
}

export function encodeTaskDescription(description = "", links: TaskLink[] = [], tags: string[] = []) {
  if (!links.length && !tags.length) return description;
  const body = description.trimEnd();
  return `${body}${body ? "\n\n" : ""}<!-- lfp-chat:task-meta ${JSON.stringify({ links, tags })} -->`;
}

/** Converts legacy category prefixes into tags without changing ordinary colon titles. */
export function cleanTaskTitle(title: string, tags: string[] = []) {
  const match = title.match(/^([^:]{2,24}):\s+(.+)$/);
  if (!match || !categoryPrefixes.has(match[1]!.trim().toLowerCase())) return { title, tags };
  const tag = match[1]!.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    title: match[2]!.trim(),
    tags: tags.some((item) => item.toLowerCase() === tag.toLowerCase()) ? tags : [tag, ...tags],
  };
}

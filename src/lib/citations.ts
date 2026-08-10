import type { ToolPart } from "@/components/ai-elements/tool";

const OPENAI_CITATION_PATTERN = /\uE200cite\uE202([^\uE201]+)\uE201/g;
const OPENAI_CITATION_REFERENCE = /^turn(\d+)search(\d+)$/;

type WebSource = {
  title?: string;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getWebSearchSources(part: ToolPart): WebSource[] | undefined {
  if (part.type !== "tool-web_search" || !("output" in part)) return undefined;
  const output = part.output;
  if (!isRecord(output) || !Array.isArray(output.sources)) return undefined;

  return output.sources.flatMap((source) => {
    if (!isRecord(source) || typeof source.url !== "string") return [];

    try {
      const url = new URL(source.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      return [{
        title: typeof source.title === "string" ? source.title : undefined,
        url: url.toString(),
      }];
    } catch {
      return [];
    }
  });
}

/** Converts OpenAI's private citation markers into ordinary Markdown links. */
export function formatCitationMarkers(text: string, tools: ToolPart[]) {
  const searches = tools.flatMap((part) => {
    const sources = getWebSearchSources(part);
    return sources ? [sources] : [];
  });
  const citationNumberByUrl = new Map<string, number>();

  const formatted = text.replace(
    OPENAI_CITATION_PATTERN,
    (_marker, references: string) => {
      const links = references
        .split("\uE202")
        .flatMap((reference) => {
          const match = OPENAI_CITATION_REFERENCE.exec(reference);
          if (!match) return [];
          const source = searches[Number(match[1])]?.[Number(match[2])];
          if (!source) return [];

          let number = citationNumberByUrl.get(source.url);
          if (!number) {
            number = citationNumberByUrl.size + 1;
            citationNumberByUrl.set(source.url, number);
          }
          return [`[[${number}]](${source.url} "${source.title ?? source.url}")`];
        });

      return links.length > 0 ? ` ${[...new Set(links)].join(" ")}` : "";
    },
  );

  // During streaming a citation token can briefly be incomplete. Hide that
  // partial control sequence until the closing marker arrives.
  return formatted.replace(/\uE200cite[^\uE201]*$/, "");
}

const DEFAULT_TOOL_OUTPUT_LIMIT = 12_000;

function maxToolOutputChars() {
  const configured = Number(process.env.TOOL_OUTPUT_MAX_CHARS);
  return Number.isFinite(configured) && configured >= 1_000
    ? configured
    : DEFAULT_TOOL_OUTPUT_LIMIT;
}

export function truncateToolText(value: string, limit = maxToolOutputChars()) {
  if (value.length <= limit) return value;
  const marker = `\n\n[Output truncated: ${value.length - limit} characters omitted. Narrow the request to inspect more.]`;
  const available = Math.max(0, limit - marker.length);
  const head = Math.ceil(available * 0.7);
  const tail = available - head;
  return `${value.slice(0, head)}${marker}${tail > 0 ? `\n\n${value.slice(-tail)}` : ""}`;
}

export function truncateToolValue(value: unknown): unknown {
  if (typeof value === "string") return truncateToolText(value);
  if (value === null || value === undefined) return value;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxToolOutputChars()) return value;
    return {
      truncated: true,
      preview: truncateToolText(serialized),
      originalCharacters: serialized.length,
    };
  } catch {
    return truncateToolText(String(value));
  }
}

const FALLBACK_ERROR_MESSAGE = "An unexpected error occurred.";

function parseStructuredError(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function readableError(value: unknown, seen = new Set<object>()): string {
  if (typeof value === "string") {
    const parsed = parseStructuredError(value);
    return parsed === value ? value : readableError(parsed, seen);
  }
  if (value instanceof Error) {
    return value.cause ? readableError(value.cause, seen) : value.message;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return FALLBACK_ERROR_MESSAGE;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["message", "cause", "errorMessage", "error"] as const) {
      if (record[key] === undefined) continue;
      const message = readableError(record[key], seen);
      if (message && message !== "Error") return message;
    }
    return FALLBACK_ERROR_MESSAGE;
  }
  return String(value ?? FALLBACK_ERROR_MESSAGE);
}

export const LFP_CHAT_CONTROLLER_ID = "lfpChat";

export const controllerModes = ["chat", "research", "plan", "act", "code"] as const;

export type ControllerModeId = (typeof controllerModes)[number];

export type ControllerToolCategory =
  | "read"
  | "edit"
  | "execute"
  | "mcp"
  | "other";

/** Shared permission classification for the server policy and approval UI. */
export function controllerToolCategory(
  toolName: string,
): ControllerToolCategory {
  if (
    /(^|_)(delete|create|update|upsert|archive|send|add|set)(_|$)/.test(
      toolName,
    ) ||
    toolName === "transaction_add"
  ) {
    return "edit";
  }
  if (
    /(^|_)(execute|command|shell|write_file|edit_file|apply_patch)(_|$)/.test(
      toolName,
    ) ||
    ["monty", "code_interpreter", "image_generation"].includes(toolName)
  ) {
    return "execute";
  }
  if (
    /(^|_)(list|get|find|search|fetch|query|read|recall|render)(_|$)/.test(
      toolName,
    )
  ) {
    return "read";
  }
  return "other";
}

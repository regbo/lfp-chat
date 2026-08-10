"use client";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Check } from "lucide-react";

type ToolEventSummaryProps = {
  parts: ToolPart[];
};

function getToolName(part: ToolPart) {
  const name =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.split("-").slice(1).join("-");
  return name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isToolRunning(part: ToolPart) {
  return part.state === "input-streaming" || part.state === "input-available";
}

export function getRunningToolLabel(parts: ToolPart[]) {
  if (!parts.some(isToolRunning)) return undefined;

  return parts.length === 1
    ? `Calling ${getToolName(parts[0])}`
    : `Calling ${parts.length} tools · ${parts
        .map((part, index) => `${index + 1} ${getToolName(part)}`)
        .join(" · ")}`;
}

export function ToolEventSummary({ parts }: ToolEventSummaryProps) {
  const running = parts.some(isToolRunning);

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-2">
      {parts.map((part, index) => {
        const output = "output" in part ? part.output : undefined;
        const errorText = "errorText" in part ? part.errorText : undefined;

        return (
          <Tool className="mb-0 bg-background" key={`${part.toolCallId}-${index}`}>
            {part.type === "dynamic-tool" ? (
              <ToolHeader
                state={part.state}
                toolName={part.toolName}
                type={part.type}
              />
            ) : (
              <ToolHeader state={part.state} type={part.type} />
            )}
            <ToolContent>
              <ToolInput input={part.input} />
              <ToolOutput errorText={errorText} output={output} />
            </ToolContent>
          </Tool>
        );
      })}
      {!running && (
        <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
          <Check className="size-3.5" /> All tool calls completed
        </div>
      )}
    </div>
  );
}

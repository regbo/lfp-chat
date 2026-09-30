"use client";

import {
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";

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
    : `Calling tools · ${parts.length} calls`;
}

function hasToolError(part: ToolPart) {
  return part.state === "output-error" || part.state === "output-denied";
}

export function getToolActivityLabel(parts: ToolPart[]) {
  if (parts.length === 0) return undefined;

  const runningLabel = getRunningToolLabel(parts);
  if (runningLabel) return runningLabel;

  const hasError = parts.some(
    (part) => part.state === "output-error" || part.state === "output-denied",
  );
  const verb = hasError ? "Finished" : "Called";

  return parts.length === 1
    ? `${verb} ${getToolName(parts[0])}`
    : `${verb} tools · ${parts.length} calls`;
}

function getToolCallLabel(part: ToolPart) {
  const name = getToolName(part);

  if (isToolRunning(part)) return `Calling ${name}`;
  if (part.state === "output-error") return `${name} failed`;
  if (part.state === "output-denied") return `${name} denied`;
  if (part.state === "approval-requested") return `${name} needs approval`;
  if (part.state === "approval-responded") return `${name} approval received`;
  return `Called ${name}`;
}

export function ToolEventSummary({ parts }: ToolEventSummaryProps) {
  return (
    <div className="not-prose space-y-1.5 text-muted-foreground">
      {parts.map((part, index) => {
          const output = "output" in part ? part.output : undefined;
          const errorText = "errorText" in part ? part.errorText : undefined;
          const running = isToolRunning(part);
          const failed = hasToolError(part);

          return (
            <Collapsible
              className="group/tool-call overflow-hidden rounded-xl border border-border/65 bg-muted/15"
              key={`${part.toolCallId}-${index}`}
            >
              <CollapsibleTrigger className="chat-tool-call-trigger flex min-h-8 w-full max-w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3 py-1.5 transition-colors hover:bg-muted/45 hover:text-foreground">
                {running ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                ) : failed ? (
                  <CircleAlert className="size-3.5 shrink-0 text-destructive" />
                ) : (
                  <Check className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-left">{getToolCallLabel(part)}</span>
                <ChevronDown className="size-3.5 shrink-0 -rotate-90 transition-transform group-data-[state=open]/tool-call:rotate-0" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 border-t border-border/55 p-2 text-foreground outline-none">
                <ToolInput input={part.input} />
                <ToolOutput errorText={errorText} output={output} />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
    </div>
  );
}

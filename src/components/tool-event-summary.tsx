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
import { Check, ChevronDown, LoaderCircle, Wrench } from "lucide-react";

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

function getCompletedToolLabel(parts: ToolPart[]) {
  const hasError = parts.some(
    (part) => part.state === "output-error" || part.state === "output-denied",
  );
  const verb = hasError ? "Finished" : "Called";

  return parts.length === 1
    ? `${verb} ${getToolName(parts[0])}`
    : `${verb} ${parts.length} tools · ${parts
        .map((part, index) => `${index + 1} ${getToolName(part)}`)
        .join(" · ")}`;
}

export function ToolEventSummary({ parts }: ToolEventSummaryProps) {
  const running = parts.some(isToolRunning);
  const label = running
    ? getRunningToolLabel(parts)
    : getCompletedToolLabel(parts);

  return (
    <Collapsible className="group/tool-summary not-prose w-full text-muted-foreground">
      <CollapsibleTrigger className="flex h-8 max-w-full items-center gap-2 rounded-lg px-1.5 text-xs transition-colors hover:bg-muted/55">
        {running ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Check className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]/tool-summary:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-3 rounded-xl border border-border/65 bg-muted/15 p-3 text-foreground">
        {parts.map((part, index) => {
          const output = "output" in part ? part.output : undefined;
          const errorText = "errorText" in part ? part.errorText : undefined;

          return (
            <section
              className={index > 0 ? "border-t border-border/65 pt-3" : undefined}
              key={`${part.toolCallId}-${index}`}
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Wrench className="size-3.5" />
                <span>{index + 1}. {getToolName(part)}</span>
              </div>
              <div className="space-y-3">
                <ToolInput input={part.input} />
                <ToolOutput errorText={errorText} output={output} />
              </div>
            </section>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

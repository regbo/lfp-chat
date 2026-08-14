import { Braces, Wrench } from "lucide-react";
import Link from "next/link";

function formattedValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

export function hasStaticDashboardInput(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function DashboardInputSummary({
  description,
  linkedToolNames = [],
  onToolSelect,
  toolHref,
  toolNames = [],
  value,
  values = [],
}: {
  description: string;
  linkedToolNames?: readonly string[];
  onToolSelect?: (name: string) => void;
  toolHref?: (name: string) => string;
  toolNames?: readonly string[];
  value?: unknown;
  values?: readonly { label: string; value: unknown }[];
}) {
  const showValue = hasStaticDashboardInput(value);
  const visibleValues = values.filter((item) => hasStaticDashboardInput(item.value));
  const displayedValues = [
    ...(showValue ? [{ label: "Value", value }] : []),
    ...visibleValues,
  ];
  if (!toolNames.length && !displayedValues.length) return null;

  return (
    <section className="space-y-2" aria-label="Inputs">
      <div>
        <h3 className="chat-ui-text font-medium">Inputs</h3>
        <p className="chat-meta-text text-muted-foreground">{description}</p>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border border-border/70 bg-muted/20">
        {toolNames.map((name) => {
          const contents = <>
            <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-xs">{name}</code>
            <span className="chat-meta-text rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">Tool</span>
          </>;
          const className = "flex w-full items-center gap-2.5 px-3 py-2.5 text-left";
          if (linkedToolNames.includes(name) && onToolSelect) {
            return <button className={`${className} transition-colors hover:bg-muted/60`} key={name} onClick={() => onToolSelect(name)} type="button">{contents}</button>;
          }
          if (toolHref) {
            return <Link className={`${className} transition-colors hover:bg-muted/60`} href={toolHref(name)} key={name}>{contents}</Link>;
          }
          return <div className={className} key={name}>{contents}</div>;
        })}
        {displayedValues.map((item, index) => (
          <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]" key={`${item.label}-${index}`}>
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Braces className="size-3.5" /> {item.label}
            </span>
            <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{formattedValue(item.value)}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

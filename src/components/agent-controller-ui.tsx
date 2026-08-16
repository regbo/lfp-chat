"use client";

import type {
  AgentControllerGoalRecord,
  AgentControllerModeInfo,
  AgentControllerTaskSnapshot,
} from "@mastra/client-js";
import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  ListChecks,
  MessageCircle,
  Search,
  Sparkles,
  Target,
  Terminal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { controllerToolCategory } from "@/lib/agent-controller";
import {
  approveControllerTool,
  clearControllerGoal,
  resumeControllerTool,
  setControllerGoal,
} from "@/lib/browser-agent-controller";
import type { ChatSessionState } from "@/lib/chat-session-store";
import { cn } from "@/lib/utils";

const modeIcons = {
  chat: MessageCircle,
  research: Search,
  plan: ClipboardList,
  act: Sparkles,
  code: Terminal,
} as const;

export function AgentModePicker({
  disabled,
  modeId,
  modes,
  onChange,
}: {
  disabled?: boolean;
  modeId: string;
  modes: AgentControllerModeInfo[];
  onChange: (modeId: string) => void;
}) {
  const current = modes.find((mode) => mode.id === modeId) ?? modes[0];
  const CurrentIcon = modeIcons[modeId as keyof typeof modeIcons] ?? Bot;
  if (!current) return null;
  return (
    <Select disabled={disabled} onValueChange={(value) => onChange(String(value))} value={modeId}>
      <SelectTrigger aria-label="Agent mode" className="h-8 max-w-36 border-0 bg-transparent px-2 shadow-none" size="sm">
        <SelectValue>
          <CurrentIcon className="size-3.5" />
          <span className="truncate">{current.name || current.id}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-48">
        {modes.map((mode) => {
          const Icon = modeIcons[mode.id as keyof typeof modeIcons] ?? Bot;
          return (
            <SelectItem key={mode.id} value={mode.id}>
              <Icon className="size-3.5" /> {mode.name || mode.id}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function formatTokens(value: unknown) {
  const number = typeof value === "number" ? value : 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function TaskProgress({ tasks }: { tasks: AgentControllerTaskSnapshot[] }) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  const percent = tasks.length === 0 ? 0 : (completed / tasks.length) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <span className="chat-meta-text text-muted-foreground">{completed}/{tasks.length}</span>
      </div>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div className="chat-meta-text flex items-start gap-2" key={task.id}>
            {task.status === "completed" ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            ) : task.status === "in_progress" ? (
              <Circle className="mt-0.5 size-3.5 shrink-0 animate-pulse fill-current text-primary" />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(task.status === "completed" && "text-muted-foreground line-through")}>{task.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubagentProgress({ subagents }: { subagents: ChatSessionState["subagents"] }) {
  return (
    <div className="space-y-1.5">
      {subagents.map((subagent) => (
        <Collapsible key={subagent.toolCallId}>
          <CollapsibleTrigger className="chat-meta-text flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted/60">
            <Bot className={cn("size-3.5", subagent.status === "running" && "animate-pulse text-primary")} />
            <span className="font-medium">{subagent.agentType}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{subagent.task}</span>
            {subagent.durationMs ? <span className="text-muted-foreground">{(subagent.durationMs / 1000).toFixed(1)}s</span> : null}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="chat-meta-text ml-5 space-y-1 border-l pl-3 text-muted-foreground">
            {subagent.toolCalls.map((tool, index) => (
              <div key={`${tool.name}-${index}`}>{tool.isError ? "Failed" : "Used"} {tool.name.replaceAll("_", " ")}</div>
            ))}
            {subagent.result ? <p className="whitespace-pre-wrap text-foreground/85">{subagent.result}</p> : null}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

function GoalDialog({
  compact = false,
  goal,
  onClear,
  onSave,
}: {
  compact?: boolean;
  goal: AgentControllerGoalRecord | null;
  onClear: () => Promise<void>;
  onSave: (objective: string, maxRuns?: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState(goal?.objective ?? "");
  const [maxRuns, setMaxRuns] = useState(goal?.maxRuns ? String(goal.maxRuns) : "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Button aria-label={goal ? "Edit autonomous goal" : "Set autonomous goal"} className="h-7 gap-1.5 px-2 text-muted-foreground" onClick={() => setOpen(true)} size={compact ? "icon-xs" : "sm"} variant="ghost">
        <Target className="size-3.5" /> {compact ? null : goal ? "Goal active" : "Set goal"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Autonomous goal</DialogTitle>
          <DialogDescription>The controller judges progress after each turn and keeps the objective attached to this thread.</DialogDescription>
        </DialogHeader>
        <Textarea onChange={(event) => setObjective(event.target.value)} placeholder="What outcome should the agent keep pursuing?" value={objective} />
        <Input inputMode="numeric" min={1} onChange={(event) => setMaxRuns(event.target.value)} placeholder="Maximum runs (optional)" type="number" value={maxRuns} />
        <DialogFooter>
          {goal ? (
            <Button disabled={busy} onClick={() => { setBusy(true); void onClear().then(() => setOpen(false)).finally(() => setBusy(false)); }} variant="outline">Clear goal</Button>
          ) : null}
          <Button disabled={busy || !objective.trim()} onClick={() => { setBusy(true); const parsed = Number(maxRuns); void onSave(objective.trim(), Number.isInteger(parsed) && parsed > 0 ? parsed : undefined).then(() => setOpen(false)).finally(() => setBusy(false)); }}>Save goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentGoalButton({
  resourceId,
  session,
  threadId,
}: {
  resourceId: string;
  session: ChatSessionState;
  threadId: string;
}) {
  return (
    <GoalDialog
      compact
      goal={session.goal}
      onClear={() => clearControllerGoal(resourceId, threadId)}
      onSave={(objective, maxRuns) => setControllerGoal(resourceId, threadId, objective, maxRuns)}
    />
  );
}

export function AgentRunPanel({
  onQueueClick,
  queueOpen = false,
  session,
}: {
  onQueueClick?: () => void;
  queueOpen?: boolean;
  session: ChatSessionState;
}) {
  const hasDetails = session.tasks.length > 0 || session.subagents.length > 0;
  const totalTokens = session.tokenUsage.totalTokens;
  const hasProgress =
    session.status === "streaming" ||
    session.status === "submitted" ||
    session.followUpQueue.length > 0 ||
    Boolean(session.goal) ||
    Boolean(session.omProgress?.status && session.omProgress.status !== "idle") ||
    (typeof totalTokens === "number" && totalTokens > 0) ||
    hasDetails;
  if (!hasProgress) return null;
  return (
    <div className="chat-column px-4 pb-1">
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-background/92 px-2 py-1 shadow-sm backdrop-blur">
        <Badge className="gap-1 border-0 px-1.5 font-normal" variant="ghost">
          {session.status === "streaming" || session.status === "submitted" ? <Circle className="size-2.5 animate-pulse fill-current text-primary" /> : <Circle className="size-2.5 text-muted-foreground" />}
          {session.modeId}
        </Badge>
        {session.followUpQueue.length > 0 ? (
          <Badge
            aria-expanded={queueOpen}
            aria-label={`Open ${session.followUpQueue.length} queued ${session.followUpQueue.length === 1 ? "message" : "messages"}`}
            className="cursor-pointer whitespace-nowrap"
            onClick={onQueueClick}
            render={<button type="button" />}
            variant="secondary"
          >
            Queue · {session.followUpQueue.length}
          </Badge>
        ) : null}
        {session.omProgress?.status && session.omProgress.status !== "idle" ? <Badge variant="outline">Memory {session.omProgress.status}</Badge> : null}
        {typeof totalTokens === "number" && totalTokens > 0 ? <span className="chat-meta-text ml-auto text-muted-foreground">{formatTokens(totalTokens)} tokens</span> : <span className="ml-auto" />}
        {session.goal ? <Badge variant="outline"><Target className="size-3" /> Goal active</Badge> : null}
      </div>
      {hasDetails ? (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="chat-meta-text mt-1 flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
            <ListChecks className="size-3.5" /> Live work <ChevronDown className="size-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm">
            {session.tasks.length > 0 ? <TaskProgress tasks={session.tasks} /> : null}
            {session.subagents.length > 0 ? <SubagentProgress subagents={session.subagents} /> : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

type Suspension = ChatSessionState["pendingSuspensions"][number];

function suspensionPayload(suspension: Suspension) {
  return suspension.suspendPayload && typeof suspension.suspendPayload === "object"
    ? suspension.suspendPayload as Record<string, unknown>
    : {};
}

function AskUserDialog({
  onRespond,
  suspension,
}: {
  onRespond: (value: string | string[]) => Promise<void>;
  suspension: Suspension;
}) {
  const payload = suspensionPayload(suspension);
  const question = String(payload.question ?? (suspension.args as { question?: unknown } | undefined)?.question ?? "The agent needs your input.");
  const options = Array.isArray(payload.options) ? payload.options.filter((option): option is { label: string; description?: string } => Boolean(option && typeof option === "object" && typeof (option as { label?: unknown }).label === "string")) : [];
  const multiple = payload.selectionMode === "multi_select";
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (value: string | string[]) => {
    setBusy(true);
    void onRespond(value).finally(() => setBusy(false));
  };
  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>{question}</DialogTitle><DialogDescription>The run is paused and will resume with your answer.</DialogDescription></DialogHeader>
        {options.length > 0 ? (
          <div className="space-y-2">
            {options.map((option) => {
              const active = selected.includes(option.label);
              return (
                <Button className="h-auto w-full justify-start whitespace-normal py-3 text-left" key={option.label} onClick={() => multiple ? setSelected((current) => active ? current.filter((label) => label !== option.label) : [...current, option.label]) : submit(option.label)} variant={active ? "secondary" : "outline"}>
                  <span><span className="block font-medium">{option.label}</span>{option.description ? <span className="chat-meta-text block text-muted-foreground">{option.description}</span> : null}</span>
                </Button>
              );
            })}
          </div>
        ) : <Textarea autoFocus onChange={(event) => setText(event.target.value)} placeholder="Type your answer" value={text} />}
        {(multiple || options.length === 0) ? <DialogFooter><Button disabled={busy || (multiple ? selected.length === 0 : !text.trim())} onClick={() => submit(multiple ? selected : text.trim())}>Resume</Button></DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  onRespond,
  suspension,
}: {
  onRespond: (value: { action: "approved" | "rejected"; feedback?: string }) => Promise<void>;
  suspension: Suspension;
}) {
  const payload = suspensionPayload(suspension);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const respond = (action: "approved" | "rejected") => {
    setBusy(true);
    void onRespond({ action, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) }).finally(() => setBusy(false));
  };
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader><DialogTitle>{String(payload.title ?? "Review the plan")}</DialogTitle><DialogDescription>Approval moves this thread into Act mode and resumes the same run.</DialogDescription></DialogHeader>
        <div className="max-h-[55dvh] overflow-y-auto rounded-xl border bg-background p-3"><MessageResponse>{String(payload.plan ?? "The agent submitted a plan for approval.")}</MessageResponse></div>
        <Textarea onChange={(event) => setFeedback(event.target.value)} placeholder="Feedback for a revision (optional)" value={feedback} />
        <DialogFooter>
          <Button disabled={busy} onClick={() => respond("rejected")} variant="outline"><X className="size-4" /> Request changes</Button>
          <Button disabled={busy} onClick={() => respond("approved")}><Check className="size-4" /> Approve and act</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentControllerDialogs({
  resourceId,
  session,
  threadId,
}: {
  resourceId: string;
  session: ChatSessionState;
  threadId: string;
}) {
  const approvalArgs = useMemo(() => {
    try { return JSON.stringify(session.pendingApproval?.args, null, 2); } catch { return String(session.pendingApproval?.args); }
  }, [session.pendingApproval]);
  const suspension = session.pendingSuspensions[0];
  return (
    <>
      {session.pendingApproval ? (
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <DialogHeader><DialogTitle>Approve {session.pendingApproval.toolName.replaceAll("_", " ")}?</DialogTitle><DialogDescription>This {controllerToolCategory(session.pendingApproval.toolName)} operation is waiting for permission.</DialogDescription></DialogHeader>
            <pre className="max-h-64 overflow-auto rounded-xl border bg-background p-3 text-xs whitespace-pre-wrap">{approvalArgs}</pre>
            <DialogFooter>
              <Button onClick={() => void approveControllerTool(resourceId, threadId, session.pendingApproval!.toolCallId, false)} variant="outline">Decline</Button>
              <Button onClick={() => void approveControllerTool(resourceId, threadId, session.pendingApproval!.toolCallId, true, true)} variant="secondary">Always allow {controllerToolCategory(session.pendingApproval.toolName)}</Button>
              <Button onClick={() => void approveControllerTool(resourceId, threadId, session.pendingApproval!.toolCallId, true)}>Approve once</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {suspension?.toolName === "submit_plan" ? (
        <PlanDialog key={suspension.toolCallId} suspension={suspension} onRespond={(value) => resumeControllerTool(resourceId, threadId, suspension.toolCallId, value)} />
      ) : suspension ? (
        <AskUserDialog key={suspension.toolCallId} suspension={suspension} onRespond={(value) => resumeControllerTool(resourceId, threadId, suspension.toolCallId, value)} />
      ) : null}
    </>
  );
}

"use client";

import type { UIMessage } from "ai";
import type {
  AgentControllerEvent,
  AgentControllerGoalRecord,
  KnownAgentControllerEvent,
  AgentControllerModeInfo,
  AgentControllerOMProgress,
  AgentControllerTaskSnapshot,
} from "@mastra/client-js";
import type { QueuedControllerFollowUp } from "@/lib/controller-follow-up-queue";

export type ChatSessionStatus = "ready" | "submitted" | "streaming" | "error";

export type AgentControllerDisplayState = Extract<
  KnownAgentControllerEvent,
  { type: "display_state_changed" }
>["displayState"];

export type AgentControllerPendingSuspension = NonNullable<
  AgentControllerDisplayState["pendingSuspensions"]
>[string];

export type AgentControllerPendingApproval = Pick<
  Extract<AgentControllerEvent, { type: "tool_approval_required" }>,
  "toolCallId" | "toolName" | "args"
>;

export type ChatSessionState = {
  messages: UIMessage[];
  status: ChatSessionStatus;
  error: Error | null;
  runId: string | null;
  abortRun: (() => Promise<void>) | null;
  historyLoaded: boolean;
  historyPage: number;
  hasMoreHistory: boolean;
  controllerReady: boolean;
  modeId: string;
  modelId: string | null;
  modes: AgentControllerModeInfo[];
  followUpQueue: QueuedControllerFollowUp[];
  pendingApproval: AgentControllerPendingApproval | null;
  pendingSuspensions: AgentControllerPendingSuspension[];
  tasks: AgentControllerTaskSnapshot[];
  subagents: Array<{
    toolCallId: string;
    agentType: string;
    task: string;
    modelId?: string;
    status: "running" | "completed" | "error";
    text: string;
    toolCalls: Array<{ name: string; isError?: boolean }>;
    result?: string;
    durationMs?: number;
  }>;
  tokenUsage: Record<string, unknown>;
  omProgress: AgentControllerOMProgress | null;
  goal: AgentControllerGoalRecord | null;
};

const sessions = new Map<string, ChatSessionState>();
const listeners = new Set<() => void>();
let revision = 0;

export function createChatSession(messages: UIMessage[] = []): ChatSessionState {
  return {
    messages,
    status: "ready",
    error: null,
    runId: null,
    abortRun: null,
    historyLoaded: true,
    historyPage: 1,
    hasMoreHistory: false,
    controllerReady: false,
    modeId: "chat",
    modelId: null,
    modes: [],
    followUpQueue: [],
    pendingApproval: null,
    pendingSuspensions: [],
    tasks: [],
    subagents: [],
    tokenUsage: {},
    omProgress: null,
    goal: null,
  };
}

export function ensureChatSession(threadId: string, messages: UIMessage[] = []) {
  const existing = sessions.get(threadId);
  if (existing) return existing;
  const created = createChatSession(messages);
  sessions.set(threadId, created);
  return created;
}

export function getChatSession(threadId: string) {
  return sessions.get(threadId);
}

export function getChatSessionRevision() {
  return revision;
}

export function subscribeToChatSessions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateChatSession(
  threadId: string,
  update: (session: ChatSessionState) => ChatSessionState,
) {
  sessions.set(threadId, update(ensureChatSession(threadId)));
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function deleteChatSession(threadId: string) {
  void sessions.get(threadId)?.abortRun?.().catch(() => undefined);
  if (!sessions.delete(threadId)) return;
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function getRunningChatThreadIds() {
  return new Set(
    Array.from(sessions.entries())
      .filter(([, session]) =>
        session.status === "submitted" || session.status === "streaming",
      )
      .map(([threadId]) => threadId),
  );
}

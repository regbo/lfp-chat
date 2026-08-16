"use client";

import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import type {
  AgentControllerEvent,
  AgentControllerModeInfo,
  AgentControllerOMProgress,
  AgentControllerTaskSnapshot,
  MastraDBMessage,
  PlanResume,
} from "@mastra/client-js";
import type { UIMessage } from "ai";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  controllerToolCategory,
  LFP_CHAT_CONTROLLER_ID,
} from "@/lib/agent-controller";
import { browserMastraClient } from "@/lib/browser-mastra-client";
import {
  ensureChatSession,
  getChatSession,
  updateChatSession,
} from "@/lib/chat-session-store";
import {
  insertControllerFollowUp,
  loadControllerFollowUpQueue,
  reorderControllerFollowUps,
  saveControllerFollowUpQueue,
  type QueuedControllerFollowUp,
} from "@/lib/controller-follow-up-queue";
import { readableError } from "@/lib/readable-error";

const controller = browserMastraClient.getAgentController(
  LFP_CHAT_CONTROLLER_ID,
);

type ControllerSession = ReturnType<typeof controller.session>;

type ControllerConnection = {
  session: ControllerSession;
  ready: Promise<void>;
  unsubscribe: (() => void) | null;
  pollTimer: number | null;
};

const connections = new Map<string, ControllerConnection>();
const CONTROLLER_POLL_INTERVAL_MS = 1_000;
let modeCatalog: AgentControllerModeInfo[] | null = null;
let modeCatalogPromise: Promise<AgentControllerModeInfo[]> | null = null;

function controllerScope(threadId: string) {
  return `web:${threadId}`;
}

function uiMessages(messages: MastraDBMessage[]): UIMessage[] {
  return toAISdkMessages(messages, { version: "v6" }) as UIMessage[];
}

function upsertMessage(messages: UIMessage[], message: UIMessage) {
  const index = messages.findIndex((candidate) => candidate.id === message.id);
  if (index < 0) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return next;
}

async function listModes() {
  if (modeCatalog) return modeCatalog;
  if (!modeCatalogPromise) {
    modeCatalogPromise = controller.listModes().then((modes) => {
      modeCatalog = modes;
      return modes;
    }).finally(() => {
      modeCatalogPromise = null;
    });
  }
  return modeCatalogPromise;
}

function eventError(event: AgentControllerEvent) {
  const value = (event as { error?: unknown }).error;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "The agent run failed.";
}

function handleEvent(threadId: string, event: AgentControllerEvent) {
  const payload = event as Record<string, unknown>;
  switch (event.type) {
    case "agent_start":
      updateChatSession(threadId, (current) => ({
        ...current,
        status: "streaming",
        error: null,
      }));
      return;
    case "agent_end":
      updateChatSession(threadId, (current) => ({
        ...current,
        status: "ready",
        runId: null,
        abortRun: null,
      }));
      return;
    case "message_start":
    case "message_update":
    case "message_end": {
      const message = payload.message as MastraDBMessage | undefined;
      if (!message) return;
      const converted = uiMessages([message])[0];
      if (!converted) return;
      updateChatSession(threadId, (current) => ({
        ...current,
        messages: upsertMessage(current.messages, converted),
        status:
          event.type === "message_end" && current.status !== "error"
            ? current.status
            : "streaming",
      }));
      return;
    }
    case "mode_changed":
      updateChatSession(threadId, (current) => ({
        ...current,
        modeId: String(payload.modeId ?? current.modeId),
      }));
      return;
    case "model_changed":
      updateChatSession(threadId, (current) => ({
        ...current,
        modelId: String(payload.modelId ?? current.modelId ?? ""),
      }));
      return;
    case "follow_up_queued":
      // Mastra's native follow-up queue only exposes a transient count. The web
      // client uses its inspectable persisted queue instead.
      return;
    case "tool_approval_required":
      updateChatSession(threadId, (current) => ({
        ...current,
        pendingApproval: {
          toolCallId: String(payload.toolCallId ?? ""),
          toolName: String(payload.toolName ?? "tool"),
          args: payload.args,
        },
      }));
      return;
    case "tool_suspended":
      updateChatSession(threadId, (current) => ({
        ...current,
        status: "ready",
        pendingSuspensions: [
          ...current.pendingSuspensions.filter(
            (item) => item.toolCallId !== payload.toolCallId,
          ),
          {
            toolCallId: String(payload.toolCallId ?? ""),
            toolName: String(payload.toolName ?? "tool"),
            args: payload.args,
            suspendPayload: payload.suspendPayload,
          },
        ],
      }));
      return;
    case "task_updated":
      updateChatSession(threadId, (current) => ({
        ...current,
        tasks: (payload.tasks ?? []) as AgentControllerTaskSnapshot[],
      }));
      return;
    case "subagent_start":
      updateChatSession(threadId, (current) => ({
        ...current,
        subagents: [
          ...current.subagents.filter(
            (item) => item.toolCallId !== payload.toolCallId,
          ),
          {
            toolCallId: String(payload.toolCallId ?? ""),
            agentType: String(payload.agentType ?? "subagent"),
            task: String(payload.task ?? "Delegated work"),
            ...(typeof payload.modelId === "string"
              ? { modelId: payload.modelId }
              : {}),
            status: "running",
            text: "",
            toolCalls: [],
          },
        ],
      }));
      return;
    case "subagent_text_delta":
      updateChatSession(threadId, (current) => ({
        ...current,
        subagents: current.subagents.map((item) =>
          item.toolCallId === payload.toolCallId
            ? { ...item, text: `${item.text}${String(payload.textDelta ?? "")}` }
            : item,
        ),
      }));
      return;
    case "subagent_tool_start":
      updateChatSession(threadId, (current) => ({
        ...current,
        subagents: current.subagents.map((item) =>
          item.toolCallId === payload.toolCallId
            ? {
                ...item,
                toolCalls: [
                  ...item.toolCalls,
                  { name: String(payload.subToolName ?? "tool") },
                ],
              }
            : item,
        ),
      }));
      return;
    case "subagent_tool_end":
      updateChatSession(threadId, (current) => ({
        ...current,
        subagents: current.subagents.map((item) => {
          if (item.toolCallId !== payload.toolCallId) return item;
          const toolCalls = [...item.toolCalls];
          const index = toolCalls.findLastIndex(
            (tool) => tool.name === payload.subToolName,
          );
          if (index >= 0) {
            toolCalls[index] = {
              ...toolCalls[index],
              isError: payload.isError === true,
            };
          }
          return { ...item, toolCalls };
        }),
      }));
      return;
    case "subagent_end":
      updateChatSession(threadId, (current) => ({
        ...current,
        subagents: current.subagents.map((item) =>
          item.toolCallId === payload.toolCallId
            ? {
                ...item,
                status: payload.isError === true ? "error" : "completed",
                result: String(payload.result ?? ""),
                durationMs: Number(payload.durationMs ?? 0),
              }
            : item,
        ),
      }));
      return;
    case "display_state_changed": {
      const displayState = payload.displayState as
        | Record<string, unknown>
        | undefined;
      if (!displayState) return;
      updateChatSession(threadId, (current) => ({
        ...current,
        status:
          displayState.isRunning === true
            ? "streaming"
            : current.status === "error"
              ? "error"
              : "ready",
        tokenUsage:
          displayState.tokenUsage && typeof displayState.tokenUsage === "object"
            ? displayState.tokenUsage as Record<string, unknown>
            : current.tokenUsage,
        omProgress:
          displayState.omProgress && typeof displayState.omProgress === "object"
            ? displayState.omProgress as AgentControllerOMProgress
            : current.omProgress,
      }));
      return;
    }
    case "goal_evaluation":
      void refreshControllerGoal(threadId);
      return;
    case "usage_update":
      updateChatSession(threadId, (current) => ({
        ...current,
        tokenUsage:
          payload.usage && typeof payload.usage === "object"
            ? payload.usage as Record<string, unknown>
            : current.tokenUsage,
      }));
      return;
    case "om_status":
      updateChatSession(threadId, (current) => ({
        ...current,
        omProgress:
          current.omProgress && typeof payload.status === "string"
            ? { ...current.omProgress, status: payload.status }
            : current.omProgress,
      }));
      return;
    case "error":
      updateChatSession(threadId, (current) => ({
        ...current,
        status: "error",
        error: new Error(eventError(event)),
        runId: null,
        abortRun: null,
      }));
      return;
  }
}

async function hydrateConnection(
  threadId: string,
  session: ControllerSession,
  includeMessages: boolean,
) {
  const [state, modes, goal, messages] = await Promise.all([
    session.state(),
    listModes(),
    session.getGoal(),
    includeMessages ? session.listMessages(threadId, 200) : Promise.resolve(null),
  ]);
  updateChatSession(threadId, (current) => ({
    ...current,
    ...(messages ? { messages: uiMessages(messages) } : {}),
    controllerReady: true,
    modeId: state.modeId,
    modelId: state.modelId,
    modes,
    status: state.running ? "streaming" : "ready",
    tokenUsage: state.tokenUsage ?? {},
    omProgress: state.omProgress ?? null,
    goal: goal ?? null,
  }));
}

function startPolling(threadId: string, connection: ControllerConnection) {
  if (connection.pollTimer !== null) return;
  const poll = async () => {
    if (connections.get(threadId) !== connection) return;
    try {
      await hydrateConnection(threadId, connection.session, true);
    } catch {
      // Keep the last usable controller state. The next poll can recover from
      // transient proxy, tunnel, or network failures without blanking the UI.
    }
    if (connections.get(threadId) === connection) {
      connection.pollTimer = window.setTimeout(
        poll,
        CONTROLLER_POLL_INTERVAL_MS,
      );
    }
  };
  connection.pollTimer = window.setTimeout(poll, CONTROLLER_POLL_INTERVAL_MS);
}

function stopPolling(connection: ControllerConnection) {
  if (connection.pollTimer !== null) {
    window.clearTimeout(connection.pollTimer);
    connection.pollTimer = null;
  }
}

export function ensureBrowserControllerSession(
  resourceId: string,
  threadId: string,
) {
  ensureChatSession(threadId);
  const storedQueue = loadControllerFollowUpQueue(
    resourceId,
    threadId,
    window.localStorage,
  );
  updateChatSession(threadId, (current) => ({
    ...current,
    followUpQueue: current.followUpQueue?.length
      ? current.followUpQueue
      : storedQueue,
  }));
  const existing = connections.get(threadId);
  if (existing) return existing.ready;

  const session = controller.session(resourceId, controllerScope(threadId));
  const connection: ControllerConnection = {
    session,
    unsubscribe: null,
    pollTimer: null,
    ready: Promise.resolve(),
  };
  connection.ready = (async () => {
    await session.create({ threadId });
    await hydrateConnection(threadId, session, false);
    try {
      const subscription = await session.subscribe({
        onEvent: (event) => handleEvent(threadId, event),
        onError: () => {
          startPolling(threadId, connection);
        },
        onReconnect: () => {
          stopPolling(connection);
          void hydrateConnection(threadId, session, true);
        },
        reconnect: { maxRetries: 12, delayMs: 500, maxDelayMs: 10_000 },
      });
      connection.unsubscribe = subscription.unsubscribe;
    } catch {
      startPolling(threadId, connection);
    }
  })().catch((error) => {
    connections.delete(threadId);
    updateChatSession(threadId, (current) => ({
      ...current,
      controllerReady: false,
      status: "error",
      error: new Error(readableError(error)),
    }));
    throw error;
  });
  connections.set(threadId, connection);
  return connection.ready;
}

async function connection(resourceId: string, threadId: string) {
  await ensureBrowserControllerSession(resourceId, threadId);
  const current = connections.get(threadId);
  if (!current) throw new Error("The AgentController session is unavailable.");
  return current;
}

export async function sendControllerMessage(options: {
  resourceId: string;
  threadId: string;
  message: PromptInputMessage;
  requestContext: Record<string, unknown>;
}) {
  const current = await connection(options.resourceId, options.threadId);
  updateChatSession(options.threadId, (state) => ({
    ...state,
    status: "submitted",
    error: null,
    abortRun: () => current.session.abort(),
  }));
  try {
    await current.session.sendMessage(
      {
        content: options.message.text.trim(),
        files: options.message.files.map((file) => ({
          data: file.url,
          mediaType: file.mediaType,
          filename: file.filename,
        })),
      },
      { requestContext: options.requestContext },
    );
  } catch (error) {
    updateChatSession(options.threadId, (state) => ({
      ...state,
      status: "error",
      error: new Error(readableError(error)),
      abortRun: null,
    }));
    throw error;
  }
}

export async function followUpController(
  resourceId: string,
  threadId: string,
  message: PromptInputMessage,
  requestContext: Record<string, unknown>,
) {
  const queued: QueuedControllerFollowUp = {
    id: crypto.randomUUID(),
    message,
    requestContext,
    createdAt: new Date().toISOString(),
  };
  updateChatSession(threadId, (state) => ({
    ...state,
    followUpQueue: [...(state.followUpQueue ?? []), queued],
  }));
  saveControllerFollowUpQueue(
    resourceId,
    threadId,
    getChatSession(threadId)?.followUpQueue ?? [],
    window.localStorage,
  );
  return queued;
}

export function removeControllerFollowUp(
  resourceId: string,
  threadId: string,
  id: string,
) {
  const queue = getChatSession(threadId)?.followUpQueue ?? [];
  const index = queue.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const item = queue[index];
  const next = queue.filter((candidate) => candidate.id !== id);
  updateChatSession(threadId, (state) => ({ ...state, followUpQueue: next }));
  saveControllerFollowUpQueue(resourceId, threadId, next, window.localStorage);
  return item ? { item, index } : null;
}

export function restoreControllerFollowUp(
  resourceId: string,
  threadId: string,
  item: QueuedControllerFollowUp,
  index?: number,
) {
  const queue = insertControllerFollowUp(
    getChatSession(threadId)?.followUpQueue ?? [],
    item,
    index,
  );
  updateChatSession(threadId, (state) => ({ ...state, followUpQueue: queue }));
  saveControllerFollowUpQueue(resourceId, threadId, queue, window.localStorage);
}

export function reorderControllerFollowUpQueue(
  resourceId: string,
  threadId: string,
  sourceId: string,
  targetId: string,
) {
  const queue = reorderControllerFollowUps(
    getChatSession(threadId)?.followUpQueue ?? [],
    sourceId,
    targetId,
  );
  updateChatSession(threadId, (state) => ({ ...state, followUpQueue: queue }));
  saveControllerFollowUpQueue(resourceId, threadId, queue, window.localStorage);
}

export async function refreshBrowserControllerSession(
  resourceId: string,
  threadId: string,
) {
  const current = await connection(resourceId, threadId);
  await hydrateConnection(threadId, current.session, false);
}

export async function steerController(
  resourceId: string,
  threadId: string,
  message: string,
  requestContext: Record<string, unknown>,
) {
  const current = await connection(resourceId, threadId);
  await current.session.steer(message, { requestContext });
}

export async function abortController(resourceId: string, threadId: string) {
  const current = await connection(resourceId, threadId);
  await current.session.abort();
}

export async function switchControllerMode(
  resourceId: string,
  threadId: string,
  modeId: string,
) {
  const current = await connection(resourceId, threadId);
  await current.session.switchMode(modeId);
}

export async function switchControllerModel(
  resourceId: string,
  threadId: string,
  modelId: string,
) {
  const current = await connection(resourceId, threadId);
  await current.session.switchModel(modelId, { scope: "thread" });
}

export async function approveControllerTool(
  resourceId: string,
  threadId: string,
  toolCallId: string,
  approved: boolean,
  alwaysAllowCategory = false,
) {
  const current = await connection(resourceId, threadId);
  const pending = getChatSession(threadId)?.pendingApproval;
  if (approved && alwaysAllowCategory && pending) {
    await current.session.setPermissionForCategory(
      controllerToolCategory(pending.toolName),
      "allow",
    );
  }
  updateChatSession(threadId, (state) => ({
    ...state,
    pendingApproval: null,
  }));
  await current.session.approveTool(toolCallId, approved);
}

export async function resumeControllerTool(
  resourceId: string,
  threadId: string,
  toolCallId: string,
  resumeData: string | string[] | PlanResume,
) {
  const current = await connection(resourceId, threadId);
  updateChatSession(threadId, (state) => ({
    ...state,
    pendingSuspensions: state.pendingSuspensions.filter(
      (item) => item.toolCallId !== toolCallId,
    ),
    status: "streaming",
  }));
  await current.session.respondToToolSuspension(toolCallId, resumeData);
}

export async function refreshControllerGoal(threadId: string) {
  const current = connections.get(threadId);
  if (!current) return;
  await current.ready;
  const goal = await current.session.getGoal();
  updateChatSession(threadId, (state) => ({ ...state, goal: goal ?? null }));
}

export async function setControllerGoal(
  resourceId: string,
  threadId: string,
  objective: string,
  maxRuns?: number,
) {
  const current = await connection(resourceId, threadId);
  const goal = await current.session.setGoal(objective, { maxRuns });
  updateChatSession(threadId, (state) => ({ ...state, goal: goal ?? null }));
}

export async function clearControllerGoal(
  resourceId: string,
  threadId: string,
) {
  const current = await connection(resourceId, threadId);
  await current.session.clearGoal();
  updateChatSession(threadId, (state) => ({ ...state, goal: null }));
}

export function disposeBrowserControllerSession(threadId: string) {
  const current = connections.get(threadId);
  current?.unsubscribe?.();
  if (current) stopPolling(current);
  connections.delete(threadId);
}

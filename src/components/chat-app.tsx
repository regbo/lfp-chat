"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { ToolPart } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ProjectsPanel,
  SchedulesPanel,
  SearchPanel,
  ToolsPanel,
} from "@/components/app-panels";
import {
  getRunningToolLabel,
  ToolEventSummary,
} from "@/components/tool-event-summary";
import { type PendingSteer, SteerQueue } from "@/components/steer-queue";
import { formatCitationMarkers } from "@/lib/citations";
import {
  formatReasoningEffort,
  MODEL_CONTEXT_KEY,
  normalizeModelSelection,
  REASONING_CONTEXT_KEY,
  type ModelCatalogResponse,
  type ModelSelection,
} from "@/lib/model-catalog";
import { cn } from "@/lib/utils";
import {
  defaultEnabledToolIds,
  normalizeEnabledToolIds,
  TOOLS_CONTEXT_KEY,
  type SelectableToolId,
} from "@/lib/tool-catalog";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Download,
  FileText,
  Folder,
  Menu,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Paperclip,
  Search,
  SquarePen,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Thread = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ActiveView = "chat" | "search" | "projects" | "scheduled" | "tools";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const suggestions = [
  "Search the project knowledge and explain how memory works.",
  "Use both tools to search the stack and calculate 144 divided by 12.",
  "Remember that I prefer concise answers, then explain this architecture.",
];

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const threadHref = (threadId: string) =>
  `/c/${encodeURIComponent(threadId)}`;

function ensureRemoteBrowserCompatibility() {
  if (typeof globalThis.crypto?.randomUUID === "function") return;
  const randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;

  try {
    if (globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomUUID });
    } else {
      Object.defineProperty(globalThis, "crypto", { value: { randomUUID } });
    }
  } catch {
    // The app's own identifiers do not depend on this compatibility helper.
  }
}

function getOrCreateResourceId() {
  ensureRemoteBrowserCompatibility();
  const key = "lfp-chat-resource-id";
  const value = `local-${makeId()}`;
  try {
    const stored = window.localStorage?.getItem(key);
    if (stored) return stored;
    window.localStorage?.setItem(key, value);
  } catch {
    // Some remote HTTP/browser privacy contexts block storage; the session still works.
  }
  return value;
}

function getText(message: UIMessage) {
  const tools = message.parts.filter(isToolPart);
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => formatCitationMarkers(part.text, tools))
    .join("");
}

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <MessageAction
      label="Copy message"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      tooltip={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </MessageAction>
  );
}

function AddFilesButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      aria-label="Add files"
      onClick={attachments.openFileDialog}
      tooltip="Add files"
    >
      <Plus className="size-5" />
    </PromptInputButton>
  );
}

function SelectedAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="w-full gap-2 px-1 pt-1" data-attachments>
      {attachments.files.map((file) => (
        <div className="flex max-w-52 items-center gap-2 rounded-xl border bg-muted/50 p-1.5" key={file.id}>
          {file.mediaType.startsWith("image/") ? (
            <Image alt={file.filename || "Upload preview"} className="size-9 rounded-lg object-cover" height={36} src={file.url} unoptimized width={36} />
          ) : (
            <span className="grid size-9 place-items-center rounded-lg bg-background"><FileText className="size-4" /></span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs">{file.filename || "Attachment"}</span>
          <Button aria-label={`Remove ${file.filename || "attachment"}`} onClick={() => attachments.remove(file.id)} size="icon-xs" variant="ghost"><X /></Button>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function MessageAttachments({ files }: { files: FileUIPart[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex max-w-xl flex-wrap gap-2">
      {files.map((file, index) =>
        file.mediaType.startsWith("image/") ? (
          <a className="overflow-hidden rounded-xl border" href={file.url} key={`${file.url}-${index}`} rel="noreferrer" target="_blank">
            <Image alt={file.filename || "Attached image"} className="max-h-64 w-auto object-cover" height={180} src={file.url} unoptimized width={240} />
          </a>
        ) : (
          <a className="flex max-w-64 items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm hover:bg-muted" download={file.filename} href={file.url} key={`${file.url}-${index}`}>
            <Paperclip className="size-4" /><span className="truncate">{file.filename || file.mediaType}</span>
          </a>
        ),
      )}
    </div>
  );
}

function getErrorMessage(error: Error) {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    return parsed.error ?? error.message;
  } catch {
    return error.message;
  }
}

type ChatComposerProps = {
  onSubmit: (message: PromptInputMessage) => Promise<void>;
  onStop: () => void;
  status: ReturnType<typeof useChat>["status"];
  steers: PendingSteer[];
  draft: string;
  editingSteerId: string | null;
  onDraftChange: (value: string) => void;
  onDeleteSteer: (id: string) => void;
  onEditSteer: (id: string) => void;
  onReorderSteer: (sourceId: string, targetId: string) => void;
  onSteer: (id: string) => void;
  modelCatalog: ModelCatalogResponse | null;
  modelSelection: ModelSelection | null;
  onModelSelectionChange: (selection: ModelSelection) => void;
};

function ModelSelector({
  catalog,
  disabled,
  onSelect,
  selection,
}: {
  catalog: ModelCatalogResponse | null;
  disabled: boolean;
  onSelect: (selection: ModelSelection) => void;
  selection: ModelSelection | null;
}) {
  const selectedModel = catalog?.models.find(
    (model) => model.id === selection?.modelId,
  );
  const label = selectedModel
    ? [selectedModel.shortLabel, formatReasoningEffort(selection?.reasoningEffort ?? null)]
        .filter(Boolean)
        .join(" ")
    : "Model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || !catalog || !selection}
        render={
          <PromptInputButton
            aria-label="Select model and reasoning"
            className="max-w-[13rem] gap-1 rounded-full px-2 text-[13px] text-muted-foreground"
            tooltip="Model and reasoning"
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Model and reasoning</DropdownMenuLabel>
          {catalog?.models.map((model) =>
            model.reasoningEfforts.length > 0 ? (
              <DropdownMenuSub key={model.id}>
                <DropdownMenuSubTrigger className="py-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{model.label}</span>
                      {model.id === selection?.modelId && (
                        <Check className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {model.description}
                    </span>
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
                    {model.reasoningEfforts.map((effort) => (
                      <DropdownMenuItem
                        className="py-1.5"
                        key={effort}
                        onClick={() =>
                          onSelect({ modelId: model.id, reasoningEffort: effort })
                        }
                      >
                        <span className="flex-1">{formatReasoningEffort(effort)}</span>
                        {model.id === selection?.modelId &&
                          effort === selection.reasoningEffort && (
                            <Check className="size-3.5 text-muted-foreground" />
                          )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                className="py-2"
                key={model.id}
                onClick={() => onSelect({ modelId: model.id, reasoningEffort: null })}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{model.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {model.description}
                  </span>
                </span>
                {model.id === selection?.modelId && (
                  <Check className="size-3.5 text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatComposer({ draft, editingSteerId, modelCatalog, modelSelection, onDraftChange, onModelSelectionChange, onSubmit, onStop, status, steers, onDeleteSteer, onEditSteer, onReorderSteer, onSteer }: ChatComposerProps) {
  return (
    <div className="relative w-full">
      <SteerQueue items={steers} onDelete={onDeleteSteer} onEdit={onEditSteer} onReorder={onReorderSteer} onSteer={onSteer} />
      <PromptInput
        accept="image/*,application/pdf,text/plain,text/csv,application/json"
        className="relative z-10 w-full [&_[data-slot=input-group]]:h-[52px] [&_[data-slot=input-group]]:rounded-[26px] [&_[data-slot=input-group]]:border-border/65 [&_[data-slot=input-group]]:bg-background [&_[data-slot=input-group]]:px-2 [&_[data-slot=input-group]]:shadow-[var(--chat-composer-shadow)] [&_[data-slot=input-group]:has([data-attachments])]:h-auto"
        globalDrop
        maxFileSize={10 * 1024 * 1024}
        maxFiles={5}
        multiple
        onError={(error) => window.alert(error.message)}
        onSubmit={onSubmit}
      >
        <SelectedAttachments />
        <AddFilesButton />
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Chat with LFP Chat"
            className="min-h-0 min-w-0 flex-1 px-2 py-2.5 text-[length:var(--text-ui-emphasis)] leading-[1.4] md:text-[length:var(--text-ui-emphasis)]"
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            placeholder={editingSteerId ? "Edit steer" : "Ask anything"}
            rows={1}
            value={draft}
          />
        </PromptInputBody>
        <ModelSelector
          catalog={modelCatalog}
          disabled={status === "submitted" || status === "streaming"}
          onSelect={onModelSelectionChange}
          selection={modelSelection}
        />
        <PromptInputButton aria-label="Start dictation" tooltip="Dictate"><Mic className="size-4" /></PromptInputButton>
        <PromptInputSubmit className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/85" onStop={onStop} status={editingSteerId ? "ready" : status} />
      </PromptInput>
    </div>
  );
}

function ChatMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const text = getText(message);
  const tools = message.parts.filter(isToolPart);
  const reasoningText = message.parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n\n");
  const isUser = message.role === "user";
  const files = message.parts.filter((part): part is FileUIPart => part.type === "file");
  const showReasoning = !isUser && (streaming || Boolean(reasoningText) || tools.length > 0);
  const runningToolLabel = streaming ? getRunningToolLabel(tools) : undefined;

  return (
    <Message className="chat-column" from={message.role}>
      <div className={cn("relative min-w-0 max-w-full", isUser && "ml-auto w-fit")}>
        <MessageContent className="text-[length:var(--text-chat)] leading-[var(--leading-chat)] tracking-[-0.01em]">
          {showReasoning && (
            <Reasoning isStreaming={streaming}>
              <ReasoningTrigger status={runningToolLabel} />
              <ReasoningContent className="space-y-2">
                {reasoningText && <MessageResponse>{formatCitationMarkers(reasoningText, tools)}</MessageResponse>}
                {tools.length > 0 && <ToolEventSummary parts={tools} />}
              </ReasoningContent>
            </Reasoning>
          )}
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return <MessageResponse key={`${message.id}-text-${index}`}>{formatCitationMarkers(part.text, tools)}</MessageResponse>;
            }
            return null;
          })}
          <MessageAttachments files={files} />
        </MessageContent>
        {text && isUser && (
          <MessageActions className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <CopyAction text={text} />
          </MessageActions>
        )}
      </div>
      {text && !isUser && (
        <MessageActions>
          <CopyAction text={text} />
          <MessageAction label="More actions" tooltip="More">
            <MoreHorizontal className="size-4" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}

type ChatSessionProps = {
  threadId: string;
  resourceId: string;
  initialMessages: UIMessage[];
  onConversationChange: () => void;
  modelCatalog: ModelCatalogResponse | null;
  modelSelection: ModelSelection | null;
  onModelSelectionChange: (selection: ModelSelection) => void;
  enabledToolIds: SelectableToolId[];
};

function ChatSession({
  threadId,
  resourceId,
  initialMessages,
  modelCatalog,
  modelSelection,
  enabledToolIds,
  onModelSelectionChange,
  onConversationChange,
}: ChatSessionProps) {
  const selectedModelId = modelSelection?.modelId;
  const selectedReasoningEffort = modelSelection?.reasoningEffort;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, trigger }) => ({
          body: {
            messages,
            trigger,
            memory: { thread: threadId, resource: resourceId },
            requestContext: selectedModelId
              ? {
                  [MODEL_CONTEXT_KEY]: selectedModelId,
                  [REASONING_CONTEXT_KEY]: selectedReasoningEffort,
                  [TOOLS_CONTEXT_KEY]: enabledToolIds,
                }
              : { [TOOLS_CONTEXT_KEY]: enabledToolIds },
          },
        }),
      }),
    [enabledToolIds, resourceId, selectedModelId, selectedReasoningEffort, threadId],
  );

  const { error, messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: () => window.setTimeout(onConversationChange, 500),
  });
  const [steers, setSteers] = useState<PendingSteer[]>([]);
  const [draft, setDraft] = useState("");
  const [editingSteerId, setEditingSteerId] = useState<string | null>(null);
  const [steerError, setSteerError] = useState("");
  const isStreaming = status === "submitted" || status === "streaming";
  const renderedMessages = useMemo(
    () => Array.from(new Map(messages.map((message) => [message.id, message])).values()),
    [messages],
  );

  const submit = useCallback(
    async ({ text, files }: PromptInputMessage) => {
      if (!text.trim() && files.length === 0) return;
      if (editingSteerId) {
        setSteers((current) =>
          current.map((item) =>
            item.id === editingSteerId
              ? {
                  ...item,
                  message: {
                    text,
                    files: files.length > 0 ? files : item.message.files,
                  },
                }
              : item,
          ),
        );
        setEditingSteerId(null);
        setDraft("");
        return;
      }
      if (isStreaming) {
        setSteers((current) => [...current, { id: makeId(), message: { text, files } }]);
        setDraft("");
        return;
      }
      await sendMessage({ text, files });
      setDraft("");
    },
    [editingSteerId, isStreaming, sendMessage],
  );

  useEffect(() => {
    if (isStreaming || editingSteerId || steers.length === 0) return;
    const next = steers[0];
    const timer = window.setTimeout(() => {
      setSteers((current) => current.filter((item) => item.id !== next.id));
      void sendMessage(next.message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingSteerId, isStreaming, sendMessage, steers]);

  const deleteSteer = useCallback((id: string) => {
    setSteers((current) => current.filter((item) => item.id !== id));
    if (editingSteerId === id) {
      setEditingSteerId(null);
      setDraft("");
    }
  }, [editingSteerId]);

  const editSteer = useCallback((id: string) => {
    const item = steers.find((candidate) => candidate.id === id);
    if (!item) return;
    setEditingSteerId(id);
    setDraft(item.message.text);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>('[aria-label="Chat with LFP Chat"]')
        ?.focus();
    });
  }, [steers]);

  const reorderSteer = useCallback((sourceId: string, targetId: string) => {
    setSteers((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const steer = useCallback(async (id: string) => {
    const item = steers.find((candidate) => candidate.id === id);
    if (!item) return;
    setSteerError("");
    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, text: item.message.text, files: item.message.files }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setSteerError(data.error || "Unable to steer the current response.");
      return;
    }
    deleteSteer(id);
  }, [deleteSteer, resourceId, steers, threadId]);

  const composerProps = {
    draft,
    editingSteerId,
    onDraftChange: setDraft,
    onDeleteSteer: deleteSteer,
    onEditSteer: editSteer,
    onModelSelectionChange,
    onReorderSteer: reorderSteer,
    onSteer: (id: string) => void steer(id),
    onStop: stop,
    onSubmit: submit,
    status,
    steers,
    modelCatalog,
    modelSelection,
  } satisfies ChatComposerProps;

  const isEmpty = renderedMessages.length === 0;
  const hasStreamingAssistant =
    renderedMessages.at(-1)?.role === "assistant";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <Conversation className="min-h-0 w-full min-w-0">
        <ConversationContent
          className={cn(
            "chat-conversation-content mx-auto w-full max-w-none pt-4",
            isEmpty ? "pb-6" : "pb-28",
          )}
        >
          {isEmpty ? (
            <ConversationEmptyState className="min-h-[calc(100dvh-7rem)] justify-center px-0 pb-8">
              <div className="chat-column space-y-5">
                <h1 className="text-balance text-center text-[24px] font-medium tracking-[-0.02em] md:text-[26px]">
                  What&apos;s on your mind today?
                </h1>
                <ChatComposer {...composerProps} />
                <div className="mx-auto flex max-w-[650px] flex-col gap-1.5 px-4">
                  {suggestions.map((suggestion) => (
                    <button
                      className="rounded-xl px-4 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      key={suggestion}
                      onClick={() => sendMessage({ text: suggestion })}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            renderedMessages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                streaming={
                  isStreaming &&
                  message.role === "assistant" &&
                  index === renderedMessages.length - 1
                }
              />
            ))
          )}
          {isStreaming && !hasStreamingAssistant && (
            <div className="chat-column flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-4 animate-pulse" /> Thinking
            </div>
          )}
          {error && (
            <div className="chat-column rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              {getErrorMessage(error)}
            </div>
          )}
          {steerError && (
            <div className="chat-column rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">{steerError}</div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {!isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent px-[var(--chat-inline-gutter)] pb-2.5 pt-9">
          <div className="chat-column pointer-events-auto">
            <ChatComposer {...composerProps} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatApp({ initialThreadId }: { initialThreadId?: string }) {
  const router = useRouter();
  const [resourceId, setResourceId] = useState("");
  const [threadId, setThreadId] = useState(() => initialThreadId || makeId());
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [threadLoaded, setThreadLoaded] = useState(() => !initialThreadId);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [enabledToolIds, setEnabledToolIds] = useState<SelectableToolId[]>(
    defaultEnabledToolIds,
  );
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResponse | null>(null);
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/models", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the model catalog.");
        return (await response.json()) as ModelCatalogResponse;
      })
      .then((catalog) => {
        if (cancelled) return;
        setModelCatalog(catalog);
        let storedSelection: Partial<ModelSelection> | undefined;
        try {
          const stored = window.localStorage.getItem("lfp-chat-model-selection");
          if (stored) storedSelection = JSON.parse(stored) as Partial<ModelSelection>;
        } catch {
          // A private or restricted browser can still use the server default.
        }
        setModelSelection(normalizeModelSelection(catalog, storedSelection));
      })
      .catch(() => {
        // The composer remains usable once the Mastra server reconnects.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("lfp-chat-enabled-tools");
        if (stored) setEnabledToolIds(normalizeEnabledToolIds(JSON.parse(stored)));
      } catch {
        // Restricted browsers use the centralized defaults for this session.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTool = useCallback((toolId: SelectableToolId) => {
    setEnabledToolIds((current) => {
      const next = current.includes(toolId)
        ? current.filter((id) => id !== toolId)
        : [...current, toolId];
      try {
        window.localStorage.setItem(
          "lfp-chat-enabled-tools",
          JSON.stringify(next),
        );
      } catch {
        // The selection still applies until this browser session ends.
      }
      return next;
    });
  }, []);

  const selectModel = useCallback(
    (selection: ModelSelection) => {
      if (!modelCatalog) return;
      const normalized = normalizeModelSelection(modelCatalog, selection);
      setModelSelection(normalized);
      try {
        window.localStorage.setItem(
          "lfp-chat-model-selection",
          JSON.stringify(normalized),
        );
      } catch {
        // Selection remains active for this browser session without persistence.
      }
    },
    [modelCatalog],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setResourceId(getOrCreateResourceId()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!resourceId) return;
    try {
      const response = await fetch(`/api/threads?resourceId=${encodeURIComponent(resourceId)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { threads: Thread[] };
      setThreads(data.threads);
    } catch {
      // Postgres may still be starting; the chat surface remains usable once it is ready.
    }
  }, [resourceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshThreads(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshThreads]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshThreads(), 10_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshThreads]);

  const newChat = useCallback(() => {
    setThreadId(makeId());
    setInitialMessages([]);
    setThreadLoaded(true);
    setMobileSidebarOpen(false);
    setActiveView("chat");
    router.push("/");
  }, [router]);

  const openThread = useCallback(async (id: string, navigate = true) => {
    if (!resourceId) return;
    if (navigate) router.push(threadHref(id));
    setThreadLoaded(false);
    const response = await fetch(
      `/api/threads/${encodeURIComponent(id)}?resourceId=${encodeURIComponent(resourceId)}`,
    );
    if (!response.ok) {
      setThreadLoaded(true);
      return;
    }
    const data = (await response.json()) as { messages: UIMessage[] };
    setInitialMessages(data.messages);
    setThreadId(id);
    setThreadLoaded(true);
    setMobileSidebarOpen(false);
    setActiveView("chat");
  }, [resourceId, router]);

  useEffect(() => {
    if (!initialThreadId || !resourceId) return;
    const timer = window.setTimeout(
      () => void openThread(initialThreadId, false),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [initialThreadId, openThread, resourceId]);

  const deleteThread = async (id: string) => {
    await fetch(`/api/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (id === threadId) newChat();
    await refreshThreads();
  };

  const installApp = async () => {
    if (!installPrompt) {
      window.alert("Use your browser menu and choose Add to Home Screen or Install app.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  const showView = (view: ActiveView) => {
    setActiveView(view);
    setMobileSidebarOpen(false);
  };

  const activeThread = threads.find((thread) => thread.id === threadId);
  const activeConversationTitle = activeThread?.title || "New chat";
  const handleConversationChange = useCallback(() => {
    router.replace(threadHref(threadId));
    void refreshThreads();
  }, [refreshThreads, router, threadId]);

  const sidebar = (
    <aside className="flex h-full w-[244px] shrink-0 flex-col bg-sidebar px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.4rem,env(safe-area-inset-top))] text-sidebar-foreground">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <button className="flex items-baseline gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold tracking-[-0.01em] hover:bg-sidebar-accent" onClick={newChat} type="button">
          LFP Chat
        </button>
        <Button
          aria-label="Close sidebar"
          className="hidden md:inline-flex"
          onClick={() => setSidebarOpen(false)}
          size="icon-sm"
          variant="ghost"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
      <nav className="space-y-px">
        <button className={cn("sidebar-item", activeView === "chat" && "bg-sidebar-accent")} onClick={newChat} type="button">
          <SquarePen className="size-[18px]" /> New chat
        </button>
        <button className={cn("sidebar-item", activeView === "search" && "bg-sidebar-accent")} onClick={() => showView("search")} type="button">
          <Search className="size-[18px]" /> Search
        </button>
        <button className={cn("sidebar-item", activeView === "projects" && "bg-sidebar-accent")} onClick={() => showView("projects")} type="button">
          <Folder className="size-[18px]" /> Projects
        </button>
        <button className={cn("sidebar-item", activeView === "scheduled" && "bg-sidebar-accent")} onClick={() => showView("scheduled")} type="button">
          <Clock3 className="size-[18px]" /> Scheduled
        </button>
        <button className={cn("sidebar-item", activeView === "tools" && "bg-sidebar-accent")} onClick={() => showView("tools")} type="button">
          <Wrench className="size-[18px]" /> Tools
        </button>
      </nav>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {threads.length > 0 && (
          <>
            <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground/80">Pinned</p>
            <div className="mb-3 space-y-px">
              {threads.slice(0, 2).map((thread) => (
                <Link className={cn("sidebar-chat-link truncate", thread.id === threadId && "sidebar-chat-link-active")} href={threadHref(thread.id)} key={`pinned-${thread.id}`} onClick={() => void openThread(thread.id, false)}>
                  <span className="truncate">{thread.title || "New chat"}</span>
                </Link>
              ))}
            </div>
          </>
        )}
        <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground/80">Recents</p>
        <div className="space-y-px">
          {threads.slice(2).map((thread) => (
            <div className={cn("group flex min-h-8 items-center rounded-lg hover:bg-sidebar-accent", thread.id === threadId && "sidebar-chat-link-active")} key={thread.id}>
              <Link className="min-w-0 flex-1 truncate px-2 py-1 text-[13px] leading-5" href={threadHref(thread.id)} onClick={() => void openThread(thread.id, false)}>
                {thread.title || "New chat"}
              </Link>
              <Button
                aria-label={`Delete ${thread.title || "chat"}`}
                className="mr-1 opacity-0 group-hover:opacity-100"
                onClick={() => void deleteThread(thread.id)}
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <button className="sidebar-item mt-2" onClick={() => void installApp()} type="button">
        <Download className="size-[18px]" /> Install app
      </button>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-sidebar-accent">
        <span className="grid size-7 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">R</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">Local user</p>
          <p className="truncate text-[11px] text-muted-foreground">Postgres memory</p>
        </div>
      </div>
    </aside>
  );

  return (
    <main className="relative flex h-dvh overflow-hidden bg-background">
      <div className={cn("hidden transition-[width] duration-200 md:block", sidebarOpen ? "w-[244px]" : "w-0 overflow-hidden")}>{sidebar}</div>
      {mobileSidebarOpen && (
        <div className="absolute inset-0 z-40 flex md:hidden">
          <button aria-label="Close sidebar" className="absolute inset-0 bg-black/35" onClick={() => setMobileSidebarOpen(false)} type="button" />
          <div className="relative">{sidebar}</div>
        </div>
      )}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border/50 px-3 pt-[env(safe-area-inset-top)] md:h-12 md:px-4 md:pt-0">
          {!sidebarOpen && (
            <Button aria-label="Open sidebar" className="hidden md:inline-flex" onClick={() => setSidebarOpen(true)} size="icon-sm" variant="ghost">
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
          <Button aria-label="Open sidebar" className="md:hidden" onClick={() => setMobileSidebarOpen(true)} size="icon-sm" variant="ghost">
            <Menu className="size-4" />
          </Button>
          {activeView === "chat" ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Select conversation"
                    className="flex min-w-0 max-w-[min(70vw,560px)] items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                    type="button"
                  />
                }
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="chat-ui-emphasis truncate font-medium tracking-[-0.01em]">{activeConversationTitle}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" sideOffset={6}>
                <DropdownMenuItem className="py-1.5" onClick={newChat}>
                  <SquarePen className="size-4" /> New chat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
                  {threads.slice(0, 10).map((thread) => (
                    <DropdownMenuItem className="py-1.5" key={`selector-${thread.id}`} onClick={() => void openThread(thread.id)}>
                      <span className="min-w-0 flex-1 truncate">{thread.title || "New chat"}</span>
                      {thread.id === threadId && <Check className="size-3.5 text-muted-foreground" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="chat-ui-emphasis font-medium">{activeView[0].toUpperCase() + activeView.slice(1)}</span>
          )}
          <Button aria-label="Memory enabled" className="ml-auto" size="icon-sm" variant="ghost">
            <Database className="size-4" />
          </Button>
        </header>
        {resourceId && threadLoaded && activeView === "chat" && (
          <ChatSession
            initialMessages={initialMessages}
            enabledToolIds={enabledToolIds}
            key={threadId}
            modelCatalog={modelCatalog}
            modelSelection={modelSelection}
            onConversationChange={handleConversationChange}
            onModelSelectionChange={selectModel}
            resourceId={resourceId}
            threadId={threadId}
          />
        )}
        {resourceId && activeView === "search" && <SearchPanel onOpen={(id) => void openThread(id)} threads={threads} />}
        {resourceId && activeView === "projects" && <ProjectsPanel onNewChat={newChat} />}
        {resourceId && activeView === "scheduled" && (
          <SchedulesPanel
            enabledToolIds={enabledToolIds}
            modelSelection={modelSelection}
            onConversationChange={refreshThreads}
            onOpenConversation={(id) => void openThread(id)}
            resourceId={resourceId}
          />
        )}
        {resourceId && activeView === "tools" && (
          <ToolsPanel enabledToolIds={enabledToolIds} onToggle={toggleTool} />
        )}
      </section>
    </main>
  );
}

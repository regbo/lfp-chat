"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationHistoryLoader,
  ConversationScrollButton,
  ConversationSubmitAutoScroll,
  ConversationViewportAutoScroll,
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
import { BrandLockup } from "@/components/brand-lockup";
import { DashboardPanel } from "@/components/dashboard-panel";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArchivedPanel,
  SchedulesPanel,
  SearchPanel,
  SettingsPanel,
  ToolsPanel,
  type DedicatedToolModelSetting,
} from "@/components/app-panels";
import {
  getRunningToolLabel,
  ToolEventSummary,
} from "@/components/tool-event-summary";
import { type PendingSteer, SteerQueue } from "@/components/steer-queue";
import { formatAttachmentLinks } from "@/lib/attachment-links";
import { DEFAULT_APP_BRANDING, type AppBranding } from "@/lib/app-branding";
import { isChatChartSpec } from "@/lib/chart-spec";
import { formatCitationMarkers } from "@/lib/citations";
import {
  browserMastraClient,
  type MastraStreamResponse,
} from "@/lib/browser-mastra-client";
import {
  deleteChatSession,
  ensureChatSession,
  getChatSession,
  getChatSessionRevision,
  getRunningChatThreadIds,
  subscribeToChatSessions,
  updateChatSession,
  type ChatSessionStatus,
} from "@/lib/chat-session-store";
import {
  DEFAULT_CHAT_AGENT_ID,
  formatReasoningEffort,
  MODEL_CONTEXT_KEY,
  normalizeModelSelection,
  REASONING_CONTEXT_KEY,
  TOOL_MODEL_SELECTIONS_CONTEXT_KEY,
  type ModelCatalogResponse,
  type ModelSelection,
} from "@/lib/model-catalog";
import { cn } from "@/lib/utils";
import { truncateToolValue } from "@/lib/tool-output";
import { SCHEDULE_TIMEZONE_CONTEXT_KEY } from "@/lib/schedules";
import {
  fallbackStarterSuggestions,
  normalizeStarterSuggestions,
  normalizeStarterTitles,
  starterSuggestionSignature,
} from "@/lib/starter-suggestions";
import {
  getThreadFolder,
  isThreadArchived,
  isThreadPinned,
  type ThreadSummary,
} from "@/lib/thread-state";
import {
  defaultEnabledToolIds,
  migrateEnabledToolIds,
  toolCatalog,
  TOOL_CATALOG_VERSION,
  TOOLS_CONTEXT_KEY,
} from "@/lib/tool-catalog";
// This relative path remains resolvable in the package's emitted declarations.
import {
  validateChatAppPlugins,
  validateChatAppMods,
  type ChatAppMod,
  type ChatAppPlugin,
} from "../lib/chat-app-plugins";
import { type FileUIPart, type UIMessage } from "ai";
import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  FileText,
  Folder,
  FolderPlus,
  LoaderCircle,
  LayoutDashboard,
  Menu,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

const ChatChart = dynamic(
  () => import("@/components/chat-chart").then((module) => module.ChatChart),
  { ssr: false },
);

type CoreView =
  | "chat"
  | "dashboard"
  | "search"
  | "scheduled"
  | "tools"
  | "archived"
  | "settings";
type ActiveView = CoreView | `plugin:${string}`;

const pluginView = (id: string): ActiveView => `plugin:${id}`;
const coreViewRoutes: Record<Exclude<CoreView, "chat">, `/${string}`> = {
  dashboard: "/dashboard",
  search: "/search",
  scheduled: "/scheduled",
  tools: "/tools",
  archived: "/archived",
  settings: "/settings",
};

function pluginHref(plugin: ChatAppPlugin) {
  return plugin.href ?? `/${plugin.id}`;
}

const STARTER_SUGGESTION_CACHE_VERSION = 1;

function useStarterSuggestions(resourceId: string, recentTitles: readonly string[]) {
  const normalizedTitles = useMemo(
    () => normalizeStarterTitles(recentTitles),
    [recentTitles],
  );
  const signature = useMemo(
    () => starterSuggestionSignature(normalizedTitles),
    [normalizedTitles],
  );
  const fallback = useMemo(
    () => fallbackStarterSuggestions(normalizedTitles),
    [normalizedTitles],
  );
  const [resolvedSuggestions, setResolvedSuggestions] = useState<{
    signature: string;
    values: string[];
  } | null>(null);

  useEffect(() => {
    if (!resourceId || !signature) return;

    const cacheKey = `lfp-chat-starters:v${STARTER_SUGGESTION_CACHE_VERSION}:${resourceId}`;
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null") as {
        expiresAt?: number;
        signature?: string;
        suggestions?: unknown;
      } | null;
      if (
        cached?.signature === signature &&
        typeof cached.expiresAt === "number" &&
        cached.expiresAt > Date.now() &&
        Array.isArray(cached.suggestions)
      ) {
        const values = normalizeStarterSuggestions(
          cached.suggestions.filter((value): value is string => typeof value === "string"),
          fallback,
        );
        const cachedTimer = window.setTimeout(
          () => setResolvedSuggestions({ signature, values }),
          0,
        );
        return () => window.clearTimeout(cachedTimer);
      }
    } catch {
      // Suggestions remain useful when browser storage is unavailable.
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, recentTitles: normalizedTitles }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to refresh suggestions.");
          return response.json() as Promise<{ suggestions?: unknown; ttlMs?: number }>;
        })
        .then((payload) => {
          const generated = Array.isArray(payload.suggestions)
            ? payload.suggestions.filter((value): value is string => typeof value === "string")
            : [];
          const next = normalizeStarterSuggestions(generated, fallback);
          setResolvedSuggestions({ signature, values: next });
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify({
              signature,
              suggestions: next,
              expiresAt: Date.now() + Math.max(60_000, payload.ttlMs ?? 30 * 60 * 1_000),
            }));
          } catch {
            // The server cache still prevents repeated model work.
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setResolvedSuggestions(null);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fallback, normalizedTitles, resourceId, signature]);

  return resolvedSuggestions?.signature === signature
    ? resolvedSuggestions.values
    : fallback;
}

function useVisualViewportShell(shellRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = shellRef.current;
    if (!viewport || !shell) return;

    // iOS may pan the layout viewport when its keyboard opens. Anchor the app
    // shell to the actually visible viewport so its header is never panned away.
    // Wait for a burst of viewport events to settle: WebKit can expose
    // intermediate keyboard-animation geometry that briefly collapses the
    // shell before reporting the final visible viewport.
    let animationFrame = 0;
    let settleTimer = 0;
    const commitShell = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        shell.style.setProperty("--visual-viewport-height", `${viewport.height}px`);
        shell.style.setProperty("--visual-viewport-top", `${viewport.offsetTop}px`);
      });
    };
    const scheduleShellUpdate = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(commitShell, 100);
    };

    commitShell();
    viewport.addEventListener("resize", scheduleShellUpdate);
    viewport.addEventListener("scroll", scheduleShellUpdate);
    viewport.addEventListener("scrollend", commitShell);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      viewport.removeEventListener("resize", scheduleShellUpdate);
      viewport.removeEventListener("scroll", scheduleShellUpdate);
      viewport.removeEventListener("scrollend", commitShell);
      shell.style.removeProperty("--visual-viewport-height");
      shell.style.removeProperty("--visual-viewport-top");
    };
  }, [shellRef]);
}

function useComposerClearance(
  containerRef: RefObject<HTMLDivElement | null>,
  dockRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const container = containerRef.current;
    const dock = dockRef.current;
    if (!container || !dock || !enabled) {
      container?.style.removeProperty("--chat-composer-clearance");
      return;
    }

    const updateClearance = () => {
      container.style.setProperty(
        "--chat-composer-clearance",
        `${Math.ceil(dock.getBoundingClientRect().height)}px`,
      );
    };

    updateClearance();
    const observer = new ResizeObserver(updateClearance);
    observer.observe(dock);

    return () => {
      observer.disconnect();
      container.style.removeProperty("--chat-composer-clearance");
    };
  }, [containerRef, dockRef, enabled]);
}

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function promptMessageToUserMessage(
  message: PromptInputMessage,
  id = makeId(),
): UIMessage {
  return {
    id,
    role: "user",
    parts: [
      ...message.files.map((file) => ({
        type: "file" as const,
        mediaType: file.mediaType,
        filename: file.filename,
        url: file.url,
      })),
      ...(message.text.trim()
        ? [{ type: "text" as const, text: message.text.trim() }]
        : []),
    ],
  };
}

const threadHref = (threadId: string) =>
  `/c/${encodeURIComponent(threadId)}`;
const threadIdFromPathname = (pathname: string) => {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
};

function viewFromPathname(
  pathname: string,
  plugins: readonly ChatAppPlugin[],
): ActiveView {
  const core = Object.entries(coreViewRoutes).find(
    ([, href]) => href === pathname,
  );
  if (core) return core[0] as Exclude<CoreView, "chat">;
  const plugin = plugins.find((candidate) => pluginHref(candidate) === pathname);
  return plugin ? pluginView(plugin.id) : "chat";
}
const THREAD_PAGE_SIZE = 6;
const TOOL_MODEL_SELECTIONS_STORAGE_KEY = "lfp-chat-tool-model-selections";

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
    .map((part) => formatAttachmentLinks(formatCitationMarkers(part.text, tools), tools))
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
          <span className="chat-ui-text min-w-0 flex-1 truncate">{file.filename || "Attachment"}</span>
          <Button aria-label={`Remove ${file.filename || "attachment"}`} onClick={() => attachments.remove(file.id)} size="icon-xs" variant="ghost"><X /></Button>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function ChatSubmitButton({
  draft,
  editingSteerId,
  onStop,
  status,
}: {
  draft: string;
  editingSteerId: string | null;
  onStop: () => void;
  status: ChatSessionStatus;
}) {
  const attachments = usePromptInputAttachments();
  const hasPendingSubmission =
    Boolean(editingSteerId) ||
    draft.trim().length > 0 ||
    attachments.files.length > 0;
  const emphasizeSubmit = hasPendingSubmission || status === "submitted" || status === "streaming";
  const isGenerating = status === "submitted" || status === "streaming";

  return (
    <PromptInputSubmit
      aria-label={status === "submitted" || status === "streaming" ? "Stop response" : "Send message"}
      className="chat-composer-submit bg-foreground text-background hover:bg-foreground/85"
      data-emphasized={emphasizeSubmit}
      onStop={onStop}
      status={isGenerating ? status : hasPendingSubmission ? "ready" : status}
    />
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
          <a className="chat-ui-text flex max-w-64 items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 hover:bg-muted" download={file.filename} href={file.url} key={`${file.url}-${index}`}>
            <Paperclip className="size-4" /><span className="truncate">{file.filename || file.mediaType}</span>
          </a>
        ),
      )}
    </div>
  );
}

function readableError(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    try {
      return JSON.stringify(value);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(value ?? "An unexpected error occurred.");
}

function getErrorMessage(error: Error) {
  try {
    return readableError(JSON.parse(error.message));
  } catch {
    return error.message;
  }
}

const MAX_STREAM_RECONNECT_ATTEMPTS = 8;

function waitForStreamReconnect(signal: AbortSignal, attempt: number) {
  if (signal.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let timer: number | undefined;
    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkReady);
      window.removeEventListener("online", checkReady);
      signal.removeEventListener("abort", finish);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const checkReady = () => {
      if (document.visibilityState === "visible" && navigator.onLine) finish();
    };

    document.addEventListener("visibilitychange", checkReady);
    window.addEventListener("online", checkReady);
    signal.addEventListener("abort", finish, { once: true });
    if (document.visibilityState === "visible" && navigator.onLine) {
      timer = window.setTimeout(finish, Math.min(500 * 2 ** attempt, 5_000));
    }
  });
}

type ChatComposerProps = {
  onSubmit: (message: PromptInputMessage) => Promise<void>;
  onStop: () => void;
  status: ChatSessionStatus;
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
  const [open, setOpen] = useState(false);
  const selectedModel = catalog?.models.find(
    (model) => model.id === selection?.modelId,
  );
  const selectedAgent = catalog?.agents.find(
    (agent) => agent.id === selection?.agentId,
  );
  const label = selectedAgent
    ? selectedAgent.shortLabel
    : selectedModel
    ? [selectedModel.shortLabel, formatReasoningEffort(selection?.reasoningEffort ?? null)]
        .filter(Boolean)
        .join(" ")
    : "Model or agent";
  const modelChoice = selectedAgent
    ? `agent:${selectedAgent.id}`
    : selectedModel
      ? `model:${selectedModel.id}`
      : "";

  const selectModelChoice = (value: string | null) => {
    if (!value || !catalog || !selection) return;
    if (value.startsWith("agent:")) {
      onSelect({
        agentId: value.slice("agent:".length),
        modelId: selection.modelId,
        reasoningEffort: null,
      });
      return;
    }
    const model = catalog.models.find(
      (candidate) => candidate.id === value.slice("model:".length),
    );
    if (!model) return;
    onSelect({
      agentId: DEFAULT_CHAT_AGENT_ID,
      modelId: model.id,
      reasoningEffort: model.defaultReasoningEffort,
    });
  };

  return (
    <>
      <PromptInputButton
        aria-label="Select model, agent, and reasoning"
        className="chat-model-trigger chat-ui-text max-w-[13rem] gap-1 rounded-full px-2 text-muted-foreground"
        disabled={disabled || !catalog || !selection}
        onClick={() => setOpen(true)}
        tooltip="Model or agent"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PromptInputButton>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          className="model-picker-sheet mt-auto h-auto max-h-[82dvh] gap-3 rounded-t-[2rem] border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-0 sm:max-w-md sm:rounded-2xl sm:p-4"
          showCloseButton={false}
          viewportClassName="place-items-end sm:place-items-center"
        >
          <DialogHeader className="items-center gap-0.5 pb-2 text-center">
            <DialogTitle className="w-full text-center text-base">Advanced</DialogTitle>
            <DialogDescription className="sr-only">
              Choose the model and its reasoning effort.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-[1.35rem] bg-muted/75">
            <div className="model-picker-row">
              <span>Model</span>
              <Select onValueChange={selectModelChoice} value={modelChoice}>
                <SelectTrigger aria-label="Model" className="model-picker-select">
                  <SelectValue>
                    {selectedAgent?.label ?? selectedModel?.label ?? "Choose model"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="min-w-64">
                  {(catalog?.agents.length ?? 0) > 0 && (
                    <SelectGroup>
                      <SelectLabel>Agents</SelectLabel>
                      {catalog?.agents.map((agent) => (
                        <SelectItem key={agent.id} value={`agent:${agent.id}`}>
                          {agent.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Models</SelectLabel>
                    {catalog?.models.map((model) => (
                      <SelectItem key={model.id} value={`model:${model.id}`}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="mx-4 h-px bg-border" />
            <div className="model-picker-row">
              <span>Intelligence</span>
              <Select
                disabled={Boolean(selectedAgent) || !selectedModel?.reasoningEfforts.length}
                onValueChange={(value) => {
                  if (!value || !selectedModel) return;
                  onSelect({
                    agentId: DEFAULT_CHAT_AGENT_ID,
                    modelId: selectedModel.id,
                    reasoningEffort: value as ModelSelection["reasoningEffort"],
                  });
                }}
                value={selection?.reasoningEffort ?? "none"}
              >
                <SelectTrigger aria-label="Intelligence" className="model-picker-select">
                  <SelectValue>
                    {selectedAgent
                      ? "Agent managed"
                      : formatReasoningEffort(selection?.reasoningEffort ?? null) || "Standard"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    <SelectLabel>Intelligence</SelectLabel>
                    {selectedModel?.reasoningEfforts.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {formatReasoningEffort(effort)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-2 h-11 rounded-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatComposer({ draft, editingSteerId, modelCatalog, modelSelection, onDraftChange, onModelSelectionChange, onSubmit, onStop, status, steers, onDeleteSteer, onEditSteer, onReorderSteer, onSteer }: ChatComposerProps) {
  return (
    <div className="relative w-full">
      <SteerQueue items={steers} onDelete={onDeleteSteer} onEdit={onEditSteer} onReorder={onReorderSteer} onSteer={onSteer} />
      <PromptInput
        accept="image/*,application/pdf,text/plain,text/csv,application/json"
        className="chat-composer relative z-10 w-full"
        data-expanded={Boolean(draft.trim() || editingSteerId)}
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
            aria-label="Message"
            className="flex-1"
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
        <ChatSubmitButton
          draft={draft}
          editingSteerId={editingSteerId}
          onStop={onStop}
          status={status}
        />
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
  const hasReasoningDetails = Boolean(reasoningText) || tools.length > 0;
  const showReasoning = !isUser && (streaming || Boolean(reasoningText) || tools.length > 0);
  const runningToolLabel = streaming ? getRunningToolLabel(tools) : undefined;
  const charts = tools.flatMap((part) => {
    const name =
      part.type === "dynamic-tool"
        ? part.toolName
        : part.type.split("-").slice(1).join("-");
    const output = "output" in part ? part.output : undefined;
    return name === "render_chart" && isChatChartSpec(output) ? [output] : [];
  });

  return (
    <Message className="chat-column" from={message.role}>
      <div className={cn("relative min-w-0 max-w-full", isUser && "ml-auto w-fit")}>
        <MessageContent
          className={cn(
            !isUser && "w-full"
          )}
        >
          {showReasoning && (
            <Reasoning isStreaming={streaming}>
              <ReasoningTrigger expandable={hasReasoningDetails} status={runningToolLabel} />
              {hasReasoningDetails ? (
                <ReasoningContent className="space-y-2">
                  {reasoningText && <MessageResponse>{formatAttachmentLinks(formatCitationMarkers(reasoningText, tools), tools)}</MessageResponse>}
                  {tools.length > 0 && <ToolEventSummary parts={tools} />}
                </ReasoningContent>
              ) : null}
            </Reasoning>
          )}
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return <MessageResponse key={`${message.id}-text-${index}`}>{formatAttachmentLinks(formatCitationMarkers(part.text, tools), tools)}</MessageResponse>;
            }
            return null;
          })}
          {charts.map((chart, index) => (
            <ChatChart key={`${message.id}-chart-${index}`} spec={chart} />
          ))}
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
  onConversationChange: (threadId: string) => void;
  onThreadListChange: () => void;
  modelCatalog: ModelCatalogResponse | null;
  modelSelection: ModelSelection | null;
  onModelSelectionChange: (selection: ModelSelection) => void;
  enabledToolIds: string[];
  toolModelSelections: Record<string, ModelSelection>;
  recentSuggestionTitles: readonly string[];
};

function ChatSession({
  threadId,
  resourceId,
  initialMessages,
  modelCatalog,
  modelSelection,
  enabledToolIds,
  toolModelSelections,
  recentSuggestionTitles,
  onModelSelectionChange,
  onConversationChange,
  onThreadListChange,
}: ChatSessionProps) {
  useSyncExternalStore(
    subscribeToChatSessions,
    getChatSessionRevision,
    getChatSessionRevision,
  );
  const session = getChatSession(threadId) ?? ensureChatSession(threadId, initialMessages);
  const { error, messages, status } = session;
  const [steers, setSteers] = useState<PendingSteer[]>([]);
  const [draft, setDraft] = useState("");
  const suggestions = useStarterSuggestions(resourceId, recentSuggestionTitles);
  const [editingSteerId, setEditingSteerId] = useState<string | null>(null);
  const [steerError, setSteerError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [submitScrollRequest, setSubmitScrollRequest] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === "submitted" || status === "streaming";
  const renderedMessages = useMemo(
    () => Array.from(new Map(messages.map((message) => [message.id, message])).values()),
    [messages],
  );

  const runMessage = useCallback(async (message: PromptInputMessage) => {
    const userMessage = promptMessageToUserMessage(message);
    const assistantId = makeId();
    const runId = makeId();
    const controller = new AbortController();
    let timedOut = false;
    let inactivityTimer = 0;
    const armInactivityTimeout = (milliseconds: number) => {
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, milliseconds);
    };
    armInactivityTimeout(90_000);
    updateChatSession(threadId, (current) => ({
      ...current,
      messages: [...current.messages, userMessage],
      status: "submitted",
      error: null,
      runId,
      abortController: controller,
    }));
    setSubmitScrollRequest((current) => current + 1);
    onConversationChange(threadId);
    window.setTimeout(onThreadListChange, 500);

    let reasoning = "";
    const textSegments: string[] = [];
    const toolParts = new Map<string, UIMessage["parts"][number]>();
    let eventOffset = 0;
    const upsertAssistant = () => {
      const parts: UIMessage["parts"] = [];
      if (reasoning) parts.push({ type: "reasoning", text: reasoning });
      parts.push(...toolParts.values());
      for (const text of textSegments) {
        if (text) parts.push({ type: "text", text });
      }
      updateChatSession(threadId, (current) => {
        const next = [...current.messages];
        const index = next.findIndex((candidate) => candidate.id === assistantId);
        const assistant: UIMessage = {
          id: assistantId,
          role: "assistant",
          parts: parts.length > 0 ? parts : [{ type: "text", text: "" }],
        };
        if (index < 0) next.push(assistant);
        else next[index] = assistant;
        return { ...current, messages: next, status: "streaming" };
      });
    };

    try {
      const requestContext = {
        [TOOLS_CONTEXT_KEY]: enabledToolIds,
        [TOOL_MODEL_SELECTIONS_CONTEXT_KEY]: toolModelSelections,
        [SCHEDULE_TIMEZONE_CONTEXT_KEY]:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        ...(modelSelection?.agentId === DEFAULT_CHAT_AGENT_ID &&
        modelSelection.modelId
          ? {
              [MODEL_CONTEXT_KEY]: modelSelection.modelId,
              [REASONING_CONTEXT_KEY]: modelSelection.reasoningEffort,
            }
          : {}),
      };
      const agentId = modelSelection?.agentId ?? DEFAULT_CHAT_AGENT_ID;
      let stream: MastraStreamResponse | null = await browserMastraClient.streamChat({
        agentId,
        // Memory is keyed by thread/resource on the server, so only this turn
        // crosses the wire instead of resending the complete transcript.
        messages: [userMessage],
        runId,
        threadId,
        resourceId,
        requestContext,
        signal: controller.signal,
      });
      const consumeStream = () => stream?.processDataStream({
        onChunk: (chunk) => {
          armInactivityTimeout(180_000);
          eventOffset += 1;
          const payload = chunk.payload ?? {};
          switch (chunk.type) {
            case "reasoning-delta":
              reasoning += typeof payload.text === "string" ? payload.text : "";
              upsertAssistant();
              break;
            case "text-start":
              textSegments.push("");
              break;
            case "text-delta": {
              if (textSegments.length === 0) textSegments.push("");
              const index = textSegments.length - 1;
              textSegments[index] += typeof payload.text === "string" ? payload.text : "";
              upsertAssistant();
              break;
            }
            case "tool-call": {
              const toolCallId = String(payload.toolCallId ?? "");
              if (!toolCallId) break;
              toolParts.set(toolCallId, {
                type: "dynamic-tool",
                toolCallId,
                toolName: String(payload.toolName ?? "tool"),
                state: "input-available",
                input: payload.args,
              });
              upsertAssistant();
              break;
            }
            case "tool-result": {
              const toolCallId = String(payload.toolCallId ?? "");
              const previous = toolParts.get(toolCallId);
              if (!previous || previous.type !== "dynamic-tool") break;
              toolParts.set(toolCallId, {
                ...previous,
                state: "output-available",
                output: truncateToolValue(payload.result ?? payload.output),
              } as UIMessage["parts"][number]);
              upsertAssistant();
              break;
            }
            case "tool-error": {
              const toolCallId = String(payload.toolCallId ?? "");
              const previous = toolParts.get(toolCallId);
              if (!previous || previous.type !== "dynamic-tool") break;
              toolParts.set(toolCallId, {
                ...previous,
                state: "output-error",
                errorText: readableError(payload.error ?? payload.message ?? "Tool failed."),
              } as UIMessage["parts"][number]);
              upsertAssistant();
              break;
            }
            case "error":
              throw new Error(readableError(payload.error ?? payload.message ?? "Chat failed."));
          }
        },
      });
      let reconnectAttempt = 0;
      while (!controller.signal.aborted) {
        try {
          if (!stream) {
            stream = await browserMastraClient.observeChat({
              agentId,
              runId,
              offset: eventOffset,
              signal: controller.signal,
            });
          }
          await consumeStream();
          break;
        } catch (streamError) {
          stream = null;
          if (
            controller.signal.aborted ||
            reconnectAttempt >= MAX_STREAM_RECONNECT_ATTEMPTS
          ) {
            throw streamError;
          }
          await waitForStreamReconnect(controller.signal, reconnectAttempt);
          if (controller.signal.aborted) break;
          reconnectAttempt += 1;
        }
      }
      updateChatSession(threadId, (current) => ({
        ...current,
        status: "ready",
        abortController: null,
      }));
    } catch (caught) {
      if (timedOut) {
        updateChatSession(threadId, (current) => ({
          ...current,
          status: "error",
          error: new Error("The response stopped making progress. Try again or choose a faster intelligence level."),
          abortController: null,
        }));
      } else if (controller.signal.aborted) {
        updateChatSession(threadId, (current) => ({
          ...current,
          status: "ready",
          abortController: null,
        }));
      } else {
        updateChatSession(threadId, (current) => ({
          ...current,
          status: "error",
          error: caught instanceof Error ? caught : new Error("Chat failed."),
          abortController: null,
        }));
      }
    } finally {
      window.clearTimeout(inactivityTimer);
      window.setTimeout(onThreadListChange, 500);
    }
  }, [enabledToolIds, modelSelection, onConversationChange, onThreadListChange, resourceId, threadId, toolModelSelections]);

  const stop = useCallback(() => {
    getChatSession(threadId)?.abortController?.abort();
  }, [threadId]);

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
      setDraft("");
      void runMessage({ text, files });
    },
    [editingSteerId, isStreaming, runMessage],
  );

  useEffect(() => {
    if (isStreaming || editingSteerId || steers.length === 0) return;
    const next = steers[0];
    const timer = window.setTimeout(() => {
      setSteers((current) => current.filter((item) => item.id !== next.id));
      void runMessage(next.message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingSteerId, isStreaming, runMessage, steers]);

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
        .querySelector<HTMLTextAreaElement>('[aria-label="Message"]')
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

  const steer = useCallback((id: string) => {
    const item = steers.find((candidate) => candidate.id === id);
    if (!item) return;
    const runId = getChatSession(threadId)?.runId;
    if (!runId) {
      setSteerError("The active run is no longer available to steer.");
      return;
    }
    setSteerError("");
    const userMessage = promptMessageToUserMessage(item.message, item.id);
    updateChatSession(threadId, (current) => ({
      ...current,
      messages: current.messages.some((message) => message.id === userMessage.id)
        ? current.messages
        : [...current.messages, userMessage],
    }));
    setSubmitScrollRequest((current) => current + 1);
    deleteSteer(id);
    const restoreSteer = () => {
      updateChatSession(threadId, (current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== userMessage.id),
      }));
      setSteers((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [item, ...current],
      );
    };
    void fetch(`/api/threads/${encodeURIComponent(threadId)}/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, resourceId, text: item.message.text, files: item.message.files }),
    }).then(async (response) => {
      if (response.ok) return;
      const data = (await response.json()) as { error?: string };
      restoreSteer();
      setSteerError(data.error || "Unable to steer the current response.");
    }).catch(() => {
      restoreSteer();
      setSteerError("Unable to reach the chat server to deliver this steer.");
    });
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

  const loadOlder = useCallback(async () => {
    const current = getChatSession(threadId);
    if (!current?.hasMoreHistory || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}?resourceId=${encodeURIComponent(resourceId)}&page=${current.historyPage}&perPage=${THREAD_PAGE_SIZE}`,
      );
      if (!response.ok) throw new Error("Unable to load earlier messages.");
      const data = (await response.json()) as { messages: UIMessage[]; hasMore: boolean };
      updateChatSession(threadId, (latest) => {
        const known = new Set(latest.messages.map((item) => item.id));
        const older = data.messages.filter((item) => !known.has(item.id));
        return {
          ...latest,
          messages: [...older, ...latest.messages],
          historyPage: latest.historyPage + 1,
          hasMoreHistory: data.hasMore,
        };
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, resourceId, threadId]);

  const isEmpty = renderedMessages.length === 0;
  const hasStreamingAssistant =
    renderedMessages.at(-1)?.role === "assistant";
  useComposerClearance(chatContainerRef, composerDockRef, true);

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
      ref={chatContainerRef}
    >
      <Conversation className="min-h-0 w-full min-w-0">
        <ConversationSubmitAutoScroll request={submitScrollRequest} />
        <ConversationViewportAutoScroll resizeTargetRef={composerDockRef} />
        <ConversationHistoryLoader
          disabled={!session.hasMoreHistory}
          loading={loadingOlder}
          onLoad={loadOlder}
        />
        <ConversationContent
          className={cn(
            "chat-conversation-content mx-auto w-full max-w-none pt-4",
            isEmpty && "min-h-full md:min-h-0",
          )}
          style={{ paddingBottom: "var(--chat-composer-clearance, 9.75rem)" }}
        >
          {loadingOlder && (
            <div className="chat-meta-text chat-column py-2 text-center text-muted-foreground">
              Loading earlier messages…
            </div>
          )}
          {isEmpty ? (
            <ConversationEmptyState className="h-auto min-h-0 flex-1 justify-stretch px-0 py-0 md:min-h-[calc(100dvh-7rem)] md:justify-center md:pb-8">
              <div className="chat-column grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] pb-2 md:block md:flex-none md:space-y-5 md:pb-0">
                <h1 className="chat-display-text self-center text-balance text-center">
                  What&apos;s on your mind today?
                </h1>
                <div className="hidden md:block">
                  <ChatComposer {...composerProps} />
                </div>
                <div className="mx-auto flex max-w-[650px] flex-col gap-1.5 px-4">
                  {suggestions.map((suggestion) => (
                    <button
                      className="chat-ui-text rounded-xl px-4 py-2 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      key={suggestion}
                      onClick={() => void runMessage({ text: suggestion, files: [] })}
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
            <Reasoning className="chat-column" isStreaming>
              <ReasoningTrigger expandable={false} />
            </Reasoning>
          )}
          {error && (
            <div className="chat-column chat-ui-text rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              {getErrorMessage(error)}
            </div>
          )}
          {steerError && (
            <div className="chat-column chat-ui-text rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">{steerError}</div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div
        className={cn(
          "chat-composer-dock pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent px-[var(--chat-inline-gutter)] pb-2.5 pt-9",
          isEmpty && "md:hidden",
        )}
        ref={composerDockRef}
      >
          <div className="chat-column pointer-events-auto">
            <ChatComposer {...composerProps} />
          </div>
      </div>
    </div>
  );
}

function ThreadActionsMenu({
  alwaysVisible = false,
  folderNames,
  thread,
  onArchive,
  onCreateFolder,
  onDelete,
  onMoveToFolder,
  onPin,
  onRename,
}: {
  alwaysVisible?: boolean;
  folderNames: readonly string[];
  thread: ThreadSummary;
  onArchive: (thread: ThreadSummary) => void;
  onCreateFolder: (thread: ThreadSummary) => void;
  onDelete: (thread: ThreadSummary) => void;
  onMoveToFolder: (thread: ThreadSummary, folder: string | null) => void;
  onPin: (thread: ThreadSummary) => void;
  onRename: (thread: ThreadSummary) => void;
}) {
  const archived = isThreadArchived(thread);
  const pinned = isThreadPinned(thread);
  const currentFolder = getThreadFolder(thread);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Chat actions for ${thread.title || "New chat"}`}
            className={cn(
              "shrink-0 hover:!bg-transparent aria-expanded:!bg-transparent data-popup-open:!bg-transparent data-popup-open:opacity-100 focus-visible:!bg-transparent focus-visible:opacity-100",
              !alwaysVisible && "opacity-0 group-hover:opacity-100",
            )}
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => onRename(thread)}>
          <Pencil /> Rename
        </DropdownMenuItem>
        {!archived && (
          <>
            <DropdownMenuItem onClick={() => onPin(thread)}>
              {pinned ? <PinOff /> : <Pin />} {pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Folder /> Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {currentFolder && (
                  <DropdownMenuItem onClick={() => onMoveToFolder(thread, null)}>
                    Recents
                  </DropdownMenuItem>
                )}
                {folderNames.map((folder) => (
                  <DropdownMenuItem
                    key={folder}
                    onClick={() => onMoveToFolder(thread, folder)}
                  >
                    {currentFolder === folder ? <Check /> : <Folder />}
                    <span className="truncate">{folder}</span>
                  </DropdownMenuItem>
                ))}
                {(currentFolder || folderNames.length > 0) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => onCreateFolder(thread)}>
                  <FolderPlus /> New folder
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuItem onClick={() => onArchive(thread)}>
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(thread)} variant="destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarThreadRow({
  active,
  controls,
  onOpen,
  onPrefetch,
  thread,
}: {
  active: boolean;
  controls: React.ReactNode;
  onOpen: (threadId: string) => void;
  onPrefetch: (threadId: string) => void;
  thread: ThreadSummary;
}) {
  return (
    <div className={cn("sidebar-chat-row group flex min-h-8 items-center rounded-lg hover:bg-sidebar-accent", active && "sidebar-chat-link-active")}>
      <Link
        className="sidebar-chat-link min-w-0 flex-1"
        href={threadHref(thread.id)}
        onClick={(event) => { event.preventDefault(); onOpen(thread.id); }}
        onFocus={() => onPrefetch(thread.id)}
        onPointerEnter={() => onPrefetch(thread.id)}
      >
        <SidebarChatTitle title={thread.title || "New chat"} />
      </Link>
      {controls}
    </div>
  );
}

function SidebarChatTitle({ title }: { title: string }) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    const measure = () => {
      const nextOverflowing = element.scrollWidth > element.clientWidth + 1;
      setOverflowing((current) =>
        current === nextOverflowing ? current : nextOverflowing,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [title]);

  return (
    <span
      className={cn(
        "sidebar-chat-title",
        overflowing && "sidebar-chat-title-overflowing",
      )}
      ref={titleRef}
    >
      {title}
    </span>
  );
}

function SidebarThreadGroup({
  children,
  defaultOpen = true,
  icon,
  indentChildren = false,
  label,
  revealItemIndex = -1,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  indentChildren?: boolean;
  label: string;
  revealItemIndex?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const items = Children.toArray(children);
  // Thread queries are newest-first, so entries after this initial window are
  // the older conversations that should stay behind an explicit disclosure.
  const initialItemCount = 5;
  const collapsedItemCount = Math.max(initialItemCount, revealItemIndex + 1);
  const visibleItems = showAll ? items : items.slice(0, collapsedItemCount);
  const hasOlderItems = items.length > collapsedItemCount;

  return (
    <section className="mb-3">
      <button
        aria-expanded={open}
        className={cn(
          "sidebar-item group/sidebar-heading hover:text-sidebar-foreground",
          icon ? "text-sidebar-foreground" : "text-muted-foreground/80",
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {icon && (
          <span className="grid size-[18px] shrink-0 place-items-center [&>svg]:size-[18px]">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className={cn("mt-0.5 space-y-px", indentChildren && "ml-4")}>
          {visibleItems}
          {hasOlderItems && (
            <button
              className="sidebar-chat-link w-full text-left text-muted-foreground/70 transition-colors hover:text-sidebar-foreground"
              onClick={() => setShowAll((current) => !current)}
              type="button"
            >
              {showAll ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export type ChatAppProps = {
  /** Product identity displayed beside the fixed LFP monogram. */
  branding?: AppBranding;
  /** Views to add to the primary sidebar without changing ChatApp internals. */
  plugins?: readonly ChatAppPlugin[];
  /** App-wide contributions for routes, settings, and host-implemented tools. */
  mods?: readonly ChatAppMod[];
  /** Server-authenticated identity used to scope memory and scheduled work. */
  user?: {
    resourceId: string;
    displayName: string;
    email?: string;
  };
};

export function ChatApp({ branding = DEFAULT_APP_BRANDING, mods = [], plugins = [], user }: ChatAppProps) {
  const appShellRef = useRef<HTMLElement>(null);
  useVisualViewportShell(appShellRef);
  const pathname = usePathname();
  const registeredMods = useMemo(() => validateChatAppMods(mods), [mods]);
  const registeredPlugins = useMemo(
    () => validateChatAppPlugins([
      ...plugins,
      ...registeredMods.flatMap((mod) => mod.views ?? []),
    ]),
    [plugins, registeredMods],
  );
  const contributedTools = useMemo(
    () => {
      const tools = registeredMods.flatMap((mod) => mod.tools ?? []);
      const builtInIds = new Set(toolCatalog.map((tool) => tool.id as string));
      const conflict = tools.find((tool) => builtInIds.has(tool.id));
      if (conflict) {
        throw new Error(`ChatApp tool id "${conflict.id}" conflicts with a built-in tool.`);
      }
      return tools;
    },
    [registeredMods],
  );
  const contributedSettings = useMemo(
    () => registeredMods.flatMap((mod) => mod.settings ? [mod.settings] : []),
    [registeredMods],
  );
  const dedicatedModelTools = useMemo(
    () => contributedTools.flatMap((tool) =>
      tool.dedicatedModel
        ? [{
            toolId: tool.id,
            title: tool.title,
            description:
              tool.dedicatedModel.description ?? tool.description,
            config: tool.dedicatedModel,
          }]
        : [],
    ),
    [contributedTools],
  );
  const initialThreadId = threadIdFromPathname(pathname);
  const activeView = useMemo(
    () => viewFromPathname(pathname, registeredPlugins),
    [pathname, registeredPlugins],
  );
  const [resourceId, setResourceId] = useState(user?.resourceId ?? "");
  const [hasDashboard, setHasDashboard] = useState(false);
  const [threadId, setThreadId] = useState(() => initialThreadId || makeId());
  const [sessionSeeds, setSessionSeeds] = useState<Map<string, UIMessage[]>>(
    () => new Map(initialThreadId ? [] : [[threadId, []]]),
  );
  const sessionSeedsRef = useRef(sessionSeeds);
  const [threadLoaded, setThreadLoaded] = useState(() => !initialThreadId);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>(
    defaultEnabledToolIds,
  );
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResponse | null>(null);
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);
  const [toolModelSelections, setToolModelSelections] = useState<
    Record<string, ModelSelection>
  >({});
  const [renamingThread, setRenamingThread] = useState<ThreadSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [folderingThread, setFolderingThread] = useState<ThreadSummary | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const openRequestId = useRef(0);
  const previousPathname = useRef(pathname);
  const skipNextRootReset = useRef(false);
  const threadLoadRequests = useRef(
    new Map<string, Promise<{ messages: UIMessage[]; hasMore: boolean } | null>>(),
  );
  useSyncExternalStore(
    subscribeToChatSessions,
    getChatSessionRevision,
    getChatSessionRevision,
  );
  const runningThreadIds = getRunningChatThreadIds();

  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    const refresh = async () => {
      const query = new URLSearchParams({ resourceId, summary: "true" });
      const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" }).catch(() => undefined);
      if (!cancelled && response?.ok) {
        const summary = await response.json() as { hasDashboard?: boolean };
        setHasDashboard(summary.hasDashboard === true);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [resourceId]);

  const rememberSession = useCallback((
    id: string,
    messages: UIMessage[],
    hasMoreHistory = false,
  ) => {
    if (!getChatSession(id)) ensureChatSession(id, messages);
    updateChatSession(id, (session) => ({
      ...session,
      messages,
      historyLoaded: true,
      historyPage: 1,
      hasMoreHistory,
    }));
    setSessionSeeds((current) => {
      const next = new Map(current).set(id, messages);
      sessionSeedsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!modelCatalog) return;
    const timer = window.setTimeout(() => {
      let stored: Record<string, Partial<ModelSelection>> = {};
      try {
        const value = window.localStorage.getItem(
          TOOL_MODEL_SELECTIONS_STORAGE_KEY,
        );
        if (value) {
          stored = JSON.parse(value) as Record<
            string,
            Partial<ModelSelection>
          >;
        }
      } catch {
        // Restricted browsers use each tool's declared model default.
      }
      setToolModelSelections(Object.fromEntries(
        dedicatedModelTools.map(({ config, toolId }) => [
          toolId,
          normalizeModelSelection(modelCatalog, {
            agentId: DEFAULT_CHAT_AGENT_ID,
            modelId: stored[toolId]?.modelId ?? config.defaultModelId,
            reasoningEffort:
              stored[toolId]?.reasoningEffort ??
              config.defaultReasoningEffort ??
              null,
          }),
        ]),
      ));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dedicatedModelTools, modelCatalog]);

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
        if (stored) {
          const storedVersion = Number(
            window.localStorage.getItem("lfp-chat-tool-catalog-version") || 1,
          );
          const raw = JSON.parse(stored) as unknown;
          const contributedIds = new Set(contributedTools.map((tool) => tool.id));
          const preserved = Array.isArray(raw)
            ? raw.filter((id): id is string => typeof id === "string" && contributedIds.has(id))
            : [];
          const migrated = Array.from(new Set([
            ...migrateEnabledToolIds(raw, storedVersion),
            ...preserved,
          ]));
          setEnabledToolIds(migrated);
          window.localStorage.setItem("lfp-chat-enabled-tools", JSON.stringify(migrated));
          window.localStorage.setItem(
            "lfp-chat-tool-catalog-version",
            String(TOOL_CATALOG_VERSION),
          );
        } else {
          setEnabledToolIds(Array.from(new Set([
            ...defaultEnabledToolIds,
            ...contributedTools.filter((tool) => tool.defaultEnabled).map((tool) => tool.id),
          ])));
        }
      } catch {
        // Restricted browsers use the centralized defaults for this session.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contributedTools]);

  const toggleTool = useCallback((toolId: string) => {
    setEnabledToolIds((current) => {
      const next = current.includes(toolId)
        ? current.filter((id) => id !== toolId)
        : [...current, toolId];
      try {
        window.localStorage.setItem(
          "lfp-chat-enabled-tools",
          JSON.stringify(next),
        );
        window.localStorage.setItem(
          "lfp-chat-tool-catalog-version",
          String(TOOL_CATALOG_VERSION),
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

  const selectToolModel = useCallback(
    (toolId: string, selection: ModelSelection) => {
      if (
        !modelCatalog ||
        !dedicatedModelTools.some((tool) => tool.toolId === toolId)
      ) {
        return;
      }
      const normalized = normalizeModelSelection(modelCatalog, {
        ...selection,
        agentId: DEFAULT_CHAT_AGENT_ID,
      });
      setToolModelSelections((current) => {
        const next = { ...current, [toolId]: normalized };
        try {
          window.localStorage.setItem(
            TOOL_MODEL_SELECTIONS_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {
          // Selection remains active for this browser session.
        }
        return next;
      });
    },
    [dedicatedModelTools, modelCatalog],
  );

  useEffect(() => {
    if (user?.resourceId) return;
    const timer = window.setTimeout(() => setResourceId(getOrCreateResourceId()), 0);
    return () => window.clearTimeout(timer);
  }, [user?.resourceId]);

  const refreshThreads = useCallback(async () => {
    if (!resourceId) return;
    try {
      const response = await fetch(`/api/threads?resourceId=${encodeURIComponent(resourceId)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { threads: ThreadSummary[] };
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
    openRequestId.current += 1;
    const nextThreadId = makeId();
    rememberSession(nextThreadId, []);
    setThreadId(nextThreadId);
    setThreadLoaded(true);
    setMobileSidebarOpen(false);
    skipNextRootReset.current = pathname !== "/";
    window.history.pushState(null, "", "/");
  }, [pathname, rememberSession]);

  const loadThread = useCallback((id: string) => {
    if (!resourceId) return Promise.resolve(null);
    const activeRequest = threadLoadRequests.current.get(id);
    if (activeRequest) return activeRequest;

    const request = fetch(
      `/api/threads/${encodeURIComponent(id)}?resourceId=${encodeURIComponent(resourceId)}&page=0&perPage=${THREAD_PAGE_SIZE}`,
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          messages: UIMessage[];
          hasMore: boolean;
        };
      })
      .catch(() => null)
      .finally(() => threadLoadRequests.current.delete(id));

    threadLoadRequests.current.set(id, request);
    return request;
  }, [resourceId]);

  const prefetchThread = useCallback(async (id: string) => {
    if (sessionSeedsRef.current.has(id)) return;
    const data = await loadThread(id);
    if (data) rememberSession(id, data.messages, data.hasMore);
  }, [loadThread, rememberSession]);

  const openThread = useCallback(async (id: string, navigate = true) => {
    if (!resourceId) return;
    const requestId = ++openRequestId.current;
    if (navigate) window.history.pushState(null, "", threadHref(id));

    // Live and previously opened chats are owned by the shared session store;
    // switching views never tears down their stream or transcript.
    if (getChatSession(id) && sessionSeedsRef.current.has(id)) {
      setThreadId(id);
      setThreadLoaded(true);
      setMobileSidebarOpen(false);
      return;
    }

    setThreadId(id);
    setThreadLoaded(false);
    setMobileSidebarOpen(false);

    const data = await loadThread(id);
    if (data) rememberSession(id, data.messages, data.hasMore);
    if (requestId !== openRequestId.current) return;
    setThreadId(id);
    setThreadLoaded(true);
  }, [loadThread, rememberSession, resourceId]);

  useEffect(() => {
    const priorPathname = previousPathname.current;
    previousPathname.current = pathname;
    const routedThreadId = threadIdFromPathname(pathname);
    if (routedThreadId && resourceId) {
      if (routedThreadId === threadId && threadLoaded) return;
      const timer = window.setTimeout(
        () => void openThread(routedThreadId, false),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    if (pathname === "/" && priorPathname !== "/") {
      if (skipNextRootReset.current) {
        skipNextRootReset.current = false;
        return;
      }
      openRequestId.current += 1;
      const nextThreadId = makeId();
      rememberSession(nextThreadId, []);
      setThreadId(nextThreadId);
      setThreadLoaded(true);
    }
  }, [openThread, pathname, rememberSession, resourceId, threadId, threadLoaded]);

  const updateThread = useCallback(async (
    thread: ThreadSummary,
    change: { title?: string; pinned?: boolean; archived?: boolean; folder?: string | null },
  ) => {
    const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, ...change }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error || "Unable to update chat.");
    await refreshThreads();
  }, [refreshThreads, resourceId]);

  const deleteThread = useCallback(async (thread: ThreadSummary) => {
    if (!window.confirm(`Delete “${thread.title || "New chat"}” permanently?`)) return;
    const response = await fetch(
      `/api/threads/${encodeURIComponent(thread.id)}?resourceId=${encodeURIComponent(resourceId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) return;
    deleteChatSession(thread.id);
    if (thread.id === threadId) newChat();
    await refreshThreads();
  }, [newChat, refreshThreads, resourceId, threadId]);

  const archiveThread = useCallback(async (thread: ThreadSummary) => {
    const archived = !isThreadArchived(thread);
    await updateThread(thread, { archived });
    if (archived && thread.id === threadId) newChat();
  }, [newChat, threadId, updateThread]);

  const pinThread = useCallback(async (thread: ThreadSummary) => {
    await updateThread(thread, { pinned: !isThreadPinned(thread) });
  }, [updateThread]);

  const beginRename = useCallback((thread: ThreadSummary) => {
    setRenamingThread(thread);
    setRenameDraft(thread.title || "New chat");
  }, []);

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = renameDraft.trim();
    if (!renamingThread || !title) return;
    await updateThread(renamingThread, { title });
    setRenamingThread(null);
  };

  const submitFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const folder = folderDraft.trim();
    if (!folderingThread || !folder) return;
    await updateThread(folderingThread, { folder });
    setFolderingThread(null);
  };

  const threadsWithBackgroundRuns = useMemo(() => {
    const knownIds = new Set(threads.map((thread) => thread.id));
    const optimisticRuns = Array.from(runningThreadIds)
      .filter((id) => !knownIds.has(id))
      .map((id) => ({
        id,
        title: "New chat",
        updatedAt: new Date().toISOString(),
      }));
    return [...optimisticRuns, ...threads];
  }, [runningThreadIds, threads]);
  const activeThread = threadsWithBackgroundRuns.find((thread) => thread.id === threadId);
  const activeThreads = useMemo(
    () => threadsWithBackgroundRuns.filter((thread) => !isThreadArchived(thread)),
    [threadsWithBackgroundRuns],
  );
  const pinnedThreads = useMemo(
    () => activeThreads.filter(isThreadPinned),
    [activeThreads],
  );
  const recentThreads = useMemo(
    () => activeThreads.filter((thread) => !isThreadPinned(thread)),
    [activeThreads],
  );
  const availableFolderNames = useMemo(
    () => Array.from(new Set(activeThreads.flatMap((thread) => {
      const folder = getThreadFolder(thread);
      return folder ? [folder] : [];
    }))).sort((left, right) => left.localeCompare(right)),
    [activeThreads],
  );
  const folderGroups = useMemo(
    () => availableFolderNames.flatMap((name) => {
      const folderThreads = recentThreads.filter((thread) => getThreadFolder(thread) === name);
      return folderThreads.length > 0 ? [{ name, threads: folderThreads }] : [];
    }),
    [availableFolderNames, recentThreads],
  );
  const unfiledRecentThreads = useMemo(
    () => recentThreads.filter((thread) => !getThreadFolder(thread)),
    [recentThreads],
  );
  const recentSuggestionTitles = useMemo(
    () => recentThreads.map((thread) => thread.title || "").filter(Boolean).slice(0, 8),
    [recentThreads],
  );
  const dedicatedToolModelSettings = useMemo(
    () => dedicatedModelTools.flatMap((tool) => {
      const selection = toolModelSelections[tool.toolId];
      return selection
        ? [{
            toolId: tool.toolId,
            title: tool.title,
            description: tool.description,
            selection,
          } satisfies DedicatedToolModelSetting]
        : [];
    }),
    [dedicatedModelTools, toolModelSelections],
  );
  const archivedThreads = useMemo(
    () => threadsWithBackgroundRuns.filter(isThreadArchived),
    [threadsWithBackgroundRuns],
  );
  const activeConversationTitle = activeThread?.title || "New chat";
  const activePlugin = activeView.startsWith("plugin:")
    ? registeredPlugins.find((plugin) => pluginView(plugin.id) === activeView)
    : undefined;
  const handleConversationChange = useCallback((changedThreadId: string) => {
    if (changedThreadId === threadId) {
      window.history.replaceState(null, "", threadHref(changedThreadId));
    }
    void refreshThreads();
  }, [refreshThreads, threadId]);
  const mountedSessionIds = useMemo(() => [threadId], [threadId]);

  const moveThreadToFolder = useCallback((thread: ThreadSummary, folder: string | null) => {
    void updateThread(thread, { folder });
  }, [updateThread]);

  const createFolderForThread = useCallback((thread: ThreadSummary) => {
    setFolderingThread(thread);
    setFolderDraft("");
  }, []);

  const renderThreadActions = useCallback((thread: ThreadSummary) => (
    <ThreadActionsMenu
      folderNames={availableFolderNames}
      onArchive={(target) => void archiveThread(target)}
      onCreateFolder={createFolderForThread}
      onDelete={(target) => void deleteThread(target)}
      onMoveToFolder={moveThreadToFolder}
      onPin={(target) => void pinThread(target)}
      onRename={beginRename}
      thread={thread}
    />
  ), [archiveThread, availableFolderNames, beginRename, createFolderForThread, deleteThread, moveThreadToFolder, pinThread]);

  const renderSidebarThreadControls = useCallback((thread: ThreadSummary) => {
    const running = runningThreadIds.has(thread.id);
    return (
      <span className="sidebar-chat-actions relative mr-1 grid size-6 shrink-0 place-items-center">
        {running && (
          <LoaderCircle
            aria-label={`${thread.title || "Chat"} is running`}
            className="size-3.5 animate-spin text-muted-foreground transition-opacity group-hover:opacity-0"
          />
        )}
        <span className="absolute inset-0 grid place-items-center">
          {renderThreadActions(thread)}
        </span>
      </span>
    );
  }, [renderThreadActions, runningThreadIds]);

  const sidebar = (
    <aside className="app-sidebar flex h-full w-[244px] shrink-0 flex-col bg-sidebar px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.4rem,env(safe-area-inset-top))] text-sidebar-foreground">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <button aria-label={`${branding.fullName}: new chat`} className="chat-ui-emphasis flex items-baseline gap-1 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent" onClick={newChat} type="button">
          <BrandLockup branding={branding} />
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
        <Link className={cn("sidebar-item", activeView === "search" && "bg-sidebar-accent")} href={coreViewRoutes.search} onClick={() => setMobileSidebarOpen(false)}>
          <Search className="size-[18px]" /> Search
        </Link>
        {hasDashboard && <Link className={cn("sidebar-item", activeView === "dashboard" && "bg-sidebar-accent")} href={coreViewRoutes.dashboard} onClick={() => setMobileSidebarOpen(false)}>
          <LayoutDashboard className="size-[18px]" /> Dashboard
        </Link>}
        <Link className={cn("sidebar-item", activeView === "scheduled" && "bg-sidebar-accent")} href={coreViewRoutes.scheduled} onClick={() => setMobileSidebarOpen(false)}>
          <Clock3 className="size-[18px]" /> Scheduled
        </Link>
        <Link className={cn("sidebar-item", activeView === "tools" && "bg-sidebar-accent")} href={coreViewRoutes.tools} onClick={() => setMobileSidebarOpen(false)}>
          <Wrench className="size-[18px]" /> Tools
        </Link>
        <Link className={cn("sidebar-item", activeView === "archived" && "bg-sidebar-accent")} href={coreViewRoutes.archived} onClick={() => setMobileSidebarOpen(false)}>
          <Archive className="size-[18px]" /> Archived
        </Link>
        {registeredPlugins.map((plugin) => {
          const view = pluginView(plugin.id);
          return (
            <Link
              className={cn("sidebar-item", activeView === view && "bg-sidebar-accent")}
              href={pluginHref(plugin)}
              key={plugin.id}
              onClick={() => setMobileSidebarOpen(false)}
            >
              <span className="grid size-[18px] shrink-0 place-items-center [&>svg]:size-[18px]">
                {plugin.icon ?? <Blocks />}
              </span>
              {plugin.label}
            </Link>
          );
        })}
        <Link className={cn("sidebar-item", activeView === "settings" && "bg-sidebar-accent")} href={coreViewRoutes.settings} onClick={() => setMobileSidebarOpen(false)}>
          <Settings className="size-[18px]" /> Settings
        </Link>
      </nav>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {pinnedThreads.length > 0 && (
          <>
            <p className="chat-meta-text px-2 pb-1 font-medium text-muted-foreground/80">Pinned</p>
            <div className="mb-3 space-y-px">
              {pinnedThreads.map((thread) => (
                <SidebarThreadRow
                  active={thread.id === threadId}
                  controls={renderSidebarThreadControls(thread)}
                  key={`pinned-${thread.id}`}
                  onOpen={(id) => void openThread(id)}
                  onPrefetch={(id) => void prefetchThread(id)}
                  thread={thread}
                />
              ))}
            </div>
          </>
        )}
        {folderGroups.map((folder) => (
          <SidebarThreadGroup
            icon={<Folder />}
            indentChildren
            key={folder.name}
            label={folder.name}
            revealItemIndex={folder.threads.findIndex((thread) => thread.id === threadId)}
          >
              {folder.threads.map((thread) => (
                <SidebarThreadRow
                  active={thread.id === threadId}
                  controls={renderSidebarThreadControls(thread)}
                  key={thread.id}
                  onOpen={(id) => void openThread(id)}
                  onPrefetch={(id) => void prefetchThread(id)}
                  thread={thread}
                />
              ))}
          </SidebarThreadGroup>
        ))}
        {unfiledRecentThreads.length > 0 && (
          <SidebarThreadGroup
            label="Recents"
            revealItemIndex={unfiledRecentThreads.findIndex((thread) => thread.id === threadId)}
          >
              {unfiledRecentThreads.map((thread) => (
                <SidebarThreadRow
                  active={thread.id === threadId}
                  controls={renderSidebarThreadControls(thread)}
                  key={thread.id}
                  onOpen={(id) => void openThread(id)}
                  onPrefetch={(id) => void prefetchThread(id)}
                  thread={thread}
                />
              ))}
          </SidebarThreadGroup>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-sidebar-accent">
        <span className="chat-meta-text grid size-7 place-items-center rounded-full bg-foreground font-semibold text-background">R</span>
        <div className="min-w-0 flex-1">
          <p className="chat-ui-text truncate font-medium">{user?.displayName || "Local user"}</p>
          <p className="chat-meta-text truncate text-muted-foreground">{user?.email || "Postgres memory"}</p>
        </div>
      </div>
    </aside>
  );

  return (
    <>
    <main className="app-shell flex bg-background" ref={appShellRef}>
      <div className={cn("hidden transition-[width] duration-200 md:block", sidebarOpen ? "w-[244px]" : "w-0 overflow-hidden")}>{sidebar}</div>
      {mobileSidebarOpen && (
        <div className="absolute inset-0 z-40 flex md:hidden">
          <button aria-label="Close sidebar" className="absolute inset-0 bg-black/35" onClick={() => setMobileSidebarOpen(false)} type="button" />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="chat-app-header group relative flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border/50 px-3 pt-[env(safe-area-inset-top)] md:h-12 md:px-4 md:pt-0">
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
                <DropdownMenuItem onClick={newChat}>
                  <SquarePen className="size-4" /> New chat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
                  {activeThreads.slice(0, 10).map((thread) => (
                    <DropdownMenuItem key={`selector-${thread.id}`} onClick={() => void openThread(thread.id)}>
                      <span className="min-w-0 flex-1 truncate">{thread.title || "New chat"}</span>
                      {thread.id === threadId && <Check className="size-3.5 text-muted-foreground" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="chat-ui-emphasis font-medium">
              {activePlugin?.label ?? activeView[0].toUpperCase() + activeView.slice(1)}
            </span>
          )}
          {activeView === "chat" && activeThread && (
            <ThreadActionsMenu
              alwaysVisible
              folderNames={availableFolderNames}
              onArchive={(target) => void archiveThread(target)}
              onCreateFolder={createFolderForThread}
              onDelete={(target) => void deleteThread(target)}
              onMoveToFolder={moveThreadToFolder}
              onPin={(target) => void pinThread(target)}
              onRename={beginRename}
              thread={activeThread}
            />
          )}
          <Button aria-label="Memory enabled" className="ml-auto" size="icon-sm" variant="ghost">
            <Database className="size-4" />
          </Button>
        </header>
        {resourceId && activeView === "chat" && mountedSessionIds.map((sessionId) => {
          const seed = sessionSeeds.get(sessionId);
          if (!seed || (sessionId === threadId && !threadLoaded)) return null;
          const active = sessionId === threadId;
          return (
            <div
              aria-hidden={!active}
              className={active ? "contents" : "hidden"}
              key={sessionId}
            >
              <ChatSession
                initialMessages={seed}
                enabledToolIds={enabledToolIds}
                modelCatalog={modelCatalog}
                modelSelection={modelSelection}
                onConversationChange={handleConversationChange}
                onModelSelectionChange={selectModel}
                onThreadListChange={refreshThreads}
                resourceId={resourceId}
                recentSuggestionTitles={recentSuggestionTitles}
                threadId={sessionId}
                toolModelSelections={toolModelSelections}
              />
            </div>
          );
        })}
        {resourceId && activeView === "chat" && !threadLoaded && (
          <div className="chat-meta-text flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /> Loading conversation
          </div>
        )}
        {resourceId && activeView === "search" && <SearchPanel onOpen={(id) => void openThread(id)} threads={activeThreads} />}
        {resourceId && activeView === "dashboard" && <DashboardPanel resourceId={resourceId} />}
        {resourceId && activeView === "scheduled" && (
          <SchedulesPanel
            enabledToolIds={enabledToolIds}
            modelCatalog={modelCatalog}
            modelSelection={modelSelection}
            onConversationChange={refreshThreads}
            onOpenConversation={(id) => void openThread(id)}
            resourceId={resourceId}
          />
        )}
        {resourceId && activeView === "tools" && (
          <ToolsPanel contributedTools={contributedTools} enabledToolIds={enabledToolIds} onToggle={toggleTool} />
        )}
        {resourceId && activeView === "archived" && (
          <ArchivedPanel
            onOpen={(id) => void openThread(id)}
            renderActions={renderThreadActions}
            threads={archivedThreads}
          />
        )}
        {resourceId && activeView === "settings" && (
          <SettingsPanel
            dedicatedToolModels={dedicatedToolModelSettings}
            modelCatalog={modelCatalog}
            modelSelection={modelSelection}
            onModelSelectionChange={selectModel}
            onToolModelSelectionChange={selectToolModel}
            resourceId={resourceId}
            extensions={contributedSettings}
          />
        )}
        {activePlugin?.content}
      </section>
    </main>
    <Dialog onOpenChange={(open) => !open && setRenamingThread(null)} open={Boolean(renamingThread)}>
      <DialogContent>
        <form onSubmit={(event) => void submitRename(event)}>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Choose a short title that makes this conversation easy to find.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            className="mt-4"
            maxLength={100}
            onChange={(event) => setRenameDraft(event.target.value)}
            value={renameDraft}
          />
          <DialogFooter className="mt-4">
            <Button disabled={!renameDraft.trim()} type="submit">Save</Button>
            <Button onClick={() => setRenamingThread(null)} type="button" variant="ghost">Cancel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog onOpenChange={(open) => !open && setFolderingThread(null)} open={Boolean(folderingThread)}>
      <DialogContent>
        <form onSubmit={(event) => void submitFolder(event)}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Name the folder for this conversation.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            className="mt-4"
            maxLength={48}
            onChange={(event) => setFolderDraft(event.target.value)}
            value={folderDraft}
          />
          <DialogFooter className="mt-4">
            <Button disabled={!folderDraft.trim()} type="submit">Create</Button>
            <Button onClick={() => setFolderingThread(null)} type="button" variant="ghost">Cancel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

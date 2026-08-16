import type { Page } from "@playwright/test";
import type { UIMessage } from "ai";
import type { ModelCatalogResponse } from "../../src/lib/model-catalog";

declare global {
  interface Window {
    __lfpSmokeViewport?: {
      setGeometry(height: number, offsetTop: number): void;
    };
  }
}

type ThreadFixture = {
  id: string;
  title: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type AppApiFixture = {
  controllerEvents?: readonly Record<string, unknown>[];
  controllerRunning?: boolean | (() => boolean);
  messagesByThread?: Readonly<Record<string, readonly UIMessage[]>>;
  modelCatalog?: ModelCatalogResponse;
  threads?: readonly ThreadFixture[];
};

export const TOOL_LAYOUT_THREAD_ID = "smoke-tool-layout";
export const LONG_TOOL_VALUE = "unbroken-tool-value-".repeat(80);

const timestamp = "2026-01-15T12:00:00.000Z";

export const sidebarThreads: ThreadFixture[] = Array.from(
  { length: 40 },
  (_, index) => ({
    id: `smoke-thread-${index + 1}`,
    title: `Smoke conversation ${String(index + 1).padStart(2, "0")}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
);

export const toolLayoutMessages: UIMessage[] = [
  {
    id: "smoke-user-message",
    role: "user",
    parts: [{ type: "text", text: "Exercise the tool-call layout." }],
  },
  {
    id: "smoke-assistant-message",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "smoke-search-call",
        toolName: "project_search",
        state: "output-available",
        input: { query: LONG_TOOL_VALUE },
        output: {
          path: `src/${LONG_TOOL_VALUE}/result.ts`,
          matches: [{ line: 42, text: LONG_TOOL_VALUE }],
        },
      },
      {
        type: "dynamic-tool",
        toolCallId: "smoke-calculator-call",
        toolName: "calculator",
        state: "output-error",
        input: { expression: "144 / 12" },
        errorText: `Fixture error: ${LONG_TOOL_VALUE}`,
      },
      {
        type: "text",
        text: "Tool layout smoke fixture complete.",
      },
    ],
  },
];

export async function installAppApiFixture(
  page: Page,
  fixture: AppApiFixture = {},
) {
  const threads = fixture.threads ?? sidebarThreads;
  const messagesByThread = fixture.messagesByThread ?? {};
  const controllerEvents = fixture.controllerEvents ?? [];
  const controllerRunning = () =>
    typeof fixture.controllerRunning === "function"
      ? fixture.controllerRunning()
      : fixture.controllerRunning ?? false;

  const controllerMessages = (threadId: string) =>
    (messagesByThread[threadId] ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: timestamp,
      threadId,
      content: { format: 2, parts: message.parts },
    }));

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const threadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)$/);
    const controllerBase = "/api/mastra/agent-controller/lfpChat";

    if (url.pathname === `${controllerBase}/sessions` && request.method() === "POST") {
      const body = request.postDataJSON() as {
        resourceId: string;
        threadId?: string;
      };
      await route.fulfill({
        json: {
          controllerId: "lfpChat",
          resourceId: body.resourceId,
          threadId: body.threadId,
        },
      });
      return;
    }
    if (url.pathname === `${controllerBase}/modes`) {
      await route.fulfill({
        json: {
          modes: [
            { id: "chat", name: "Chat" },
            { id: "research", name: "Research" },
            { id: "plan", name: "Plan" },
            { id: "act", name: "Act" },
          ],
        },
      });
      return;
    }
    const controllerSessionMatch = url.pathname.match(
      /^\/api\/mastra\/agent-controller\/lfpChat\/sessions\/([^/]+)(.*)$/,
    );
    if (controllerSessionMatch) {
      const suffix = controllerSessionMatch[2];
      const scope = url.searchParams.get("sessionScope") ?? "";
      const scopedThreadId = scope.startsWith("web:") ? scope.slice(4) : "";
      const messageMatch = suffix.match(/^\/threads\/([^/]+)\/messages$/);
      if (suffix === "/stream") {
        await route.fulfill({
          body: [
            ": connected",
            ...controllerEvents.map((event) => `data: ${JSON.stringify(event)}`),
            "",
          ].join("\n\n"),
          contentType: "text/event-stream",
        });
        return;
      }
      if (suffix === "/goal") {
        await route.fulfill({ json: {} });
        return;
      }
      if (messageMatch) {
        const threadId = decodeURIComponent(messageMatch[1]);
        await route.fulfill({ json: { messages: controllerMessages(threadId) } });
        return;
      }
      if (suffix === "" && request.method() === "GET") {
        await route.fulfill({
          json: {
            controllerId: "lfpChat",
            resourceId: decodeURIComponent(controllerSessionMatch[1]),
            threadId: scopedThreadId,
            modeId: "chat",
            modelId: "openai/gpt-5.6-luna",
            running: controllerRunning(),
            tokenUsage: {},
            settings: { yolo: false, notifications: "off", smartEditing: true },
          },
        });
        return;
      }
      await route.fulfill({ json: {} });
      return;
    }

    if (url.pathname === "/api/threads" && request.method() === "GET") {
      await route.fulfill({ json: { threads } });
      return;
    }
    if (threadMatch && request.method() === "GET") {
      const threadId = decodeURIComponent(threadMatch[1]);
      await route.fulfill({
        json: {
          messages: messagesByThread[threadId] ?? [],
          hasMore: false,
        },
      });
      return;
    }
    if (url.pathname === "/api/dashboard") {
      await route.fulfill({ json: { hasDashboard: false } });
      return;
    }
    if (url.pathname === "/api/models") {
      await route.fulfill(
        fixture.modelCatalog
          ? { json: fixture.modelCatalog }
          : { status: 503, json: { error: "Smoke fixture" } },
      );
      return;
    }
    if (url.pathname === "/api/suggestions") {
      await route.fulfill({ json: { suggestions: [], ttlMs: 60_000 } });
      return;
    }
    if (url.pathname === "/api/push") {
      await route.fulfill({ json: { enabled: false } });
      return;
    }
    if (url.pathname === "/api/notifications") {
      await route.fulfill({ json: { notifications: [] } });
      return;
    }

    await route.fulfill({ json: {} });
  });
}

export async function installVisualViewportFixture(page: Page) {
  await page.addInitScript(() => {
    const state = {
      height: window.innerHeight,
      offsetTop: 0,
      width: window.innerWidth,
    };
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => state.height },
      offsetTop: { get: () => state.offsetTop },
      width: { get: () => state.width },
      offsetLeft: { get: () => 0 },
      pageLeft: { get: () => 0 },
      pageTop: { get: () => state.offsetTop },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "__lfpSmokeViewport", {
      configurable: true,
      value: {
        setGeometry(height: number, offsetTop: number) {
          state.height = height;
          state.offsetTop = offsetTop;
          viewport.dispatchEvent(new Event("resize"));
          viewport.dispatchEvent(new Event("scroll"));
          window.setTimeout(
            () => viewport.dispatchEvent(new Event("scrollend")),
            120,
          );
        },
      },
    });
  });
}

export async function setVisualViewport(
  page: Page,
  height: number,
  offsetTop: number,
) {
  await page.evaluate(
    ({ nextHeight, nextOffsetTop }) => {
      const control = window.__lfpSmokeViewport;
      if (!control) throw new Error("The visual viewport fixture is not installed.");
      control.setGeometry(nextHeight, nextOffsetTop);
    },
    { nextHeight: height, nextOffsetTop: offsetTop },
  );
}

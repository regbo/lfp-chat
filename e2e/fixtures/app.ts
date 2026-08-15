import type { Page } from "@playwright/test";
import type { UIMessage } from "ai";

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
  messagesByThread?: Readonly<Record<string, readonly UIMessage[]>>;
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

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const threadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)$/);

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
      await route.fulfill({ status: 503, json: { error: "Smoke fixture" } });
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

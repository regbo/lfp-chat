import { expect, test } from "@playwright/test";

import {
  installAppApiFixture,
  installVisualViewportFixture,
  LONG_TOOL_VALUE,
  setVisualViewport,
  sidebarThreads,
  TOOL_LAYOUT_THREAD_ID,
  toolLayoutMessages,
} from "./fixtures/app";

test.beforeEach(async ({ page }) => {
  await installAppApiFixture(page, {
    threads: sidebarThreads,
    messagesByThread: {
      [TOOL_LAYOUT_THREAD_ID]: toolLayoutMessages,
    },
  });
});

test("the sidebar remains independently scrollable", async ({ page }) => {
  await page.goto("/");
  if (await page.getByRole("button", { name: "Open sidebar" }).isVisible()) {
    await page.getByRole("button", { name: "Open sidebar" }).click();
  }

  const sidebar = page.locator("aside.app-sidebar:visible");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: "Show more" }).click();

  const metrics = await sidebar.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await sidebar.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(sidebar.getByText("Local user")).toBeInViewport();
});

test("theme selection applies immediately and persists", async ({ page }) => {
  await page.goto("/settings");

  const theme = page.getByRole("combobox", { name: "Color theme" });
  await expect(theme).toBeVisible();
  await theme.click();
  await page.getByRole("option", { name: "Always dark" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lfp-chat-theme"))).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(theme).toContainText("Always dark");
});

test("tool-call details stay within the chat column", async ({ page }) => {
  await page.goto(`/c/${TOOL_LAYOUT_THREAD_ID}`);
  await expect(page.getByText("Tool layout smoke fixture complete.")).toBeVisible();

  await page.getByRole("button", { name: /Thought for a few seconds/ }).click();
  await page.getByRole("button", { name: /Finished 2 tools/ }).click();
  await expect(page.getByText(LONG_TOOL_VALUE, { exact: false }).first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>(".chat-tool-summary-trigger");
    const column = trigger?.closest<HTMLElement>(".chat-column");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const codeScrollers = Array.from(
      document.querySelectorAll<HTMLElement>(".chat-reasoning-content .overflow-auto"),
    );
    if (!trigger || !column || !shell) throw new Error("Tool layout did not render.");
    const triggerBox = trigger.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    return {
      codeUsesInternalOverflow: codeScrollers.some(
        (element) => element.scrollWidth > element.clientWidth,
      ),
      shellHasHorizontalOverflow: shell.scrollWidth > shell.clientWidth,
      triggerInsideColumn:
        triggerBox.left >= columnBox.left - 1 &&
        triggerBox.right <= columnBox.right + 1,
    };
  });

  expect(layout.codeUsesInternalOverflow).toBe(true);
  expect(layout.shellHasHorizontalOverflow).toBe(false);
  expect(layout.triggerInsideColumn).toBe(true);
});

test("mobile keyboard viewport geometry keeps the shell and composer visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-webkit", "The visual keyboard risk is mobile-specific.");
  await installVisualViewportFixture(page);
  await page.goto("/");

  const composer = page.locator('textarea[aria-label="Message"]:visible');
  await composer.focus();
  const initialHeight = await page.evaluate(() => window.innerHeight);
  const keyboardHeight = Math.max(320, initialHeight - 240);
  await setVisualViewport(page, keyboardHeight, 48);

  await expect.poll(() => page.locator(".app-shell").evaluate((shell) => ({
    height: shell.style.getPropertyValue("--visual-viewport-height"),
    top: shell.style.getPropertyValue("--visual-viewport-top"),
  }))).toEqual({ height: `${keyboardHeight}px`, top: "48px" });

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const header = document.querySelector<HTMLElement>(".chat-app-header");
    const composerDock = document.querySelector<HTMLElement>(".chat-composer-dock");
    if (!shell || !header || !composerDock) throw new Error("Chat shell did not render.");
    const shellBox = shell.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const composerBox = composerDock.getBoundingClientRect();
    return {
      activeLabel: document.activeElement?.getAttribute("aria-label"),
      composerInsideShell: composerBox.bottom <= shellBox.bottom + 1,
      headerInsideShell: headerBox.top >= shellBox.top - 1,
      shellHeight: Math.round(shellBox.height),
      shellTop: Math.round(shellBox.top),
    };
  });

  expect(geometry).toEqual({
    activeLabel: "Message",
    composerInsideShell: true,
    headerInsideShell: true,
    shellHeight: keyboardHeight,
    shellTop: 48,
  });
});

test("mobile composer does not reserve an empty control slot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-webkit", "The compact composer is mobile-specific.");
  await page.goto("/");

  const modelSelector = page.getByRole("button", {
    name: "Select model, agent, and reasoning",
  });
  const submit = page.getByRole("button", { name: "Send message" });
  await expect(modelSelector).toBeVisible();
  await expect(submit).toBeVisible();

  const controlGap = async () => {
    const modelBox = await modelSelector.boundingBox();
    const submitBox = await submit.boundingBox();
    if (!modelBox || !submitBox) throw new Error("Composer controls did not render.");
    return Math.round(submitBox.x - (modelBox.x + modelBox.width));
  };

  await expect.poll(controlGap).toBeLessThanOrEqual(4);

  await page.getByRole("textbox", { name: "Message" }).focus();
  await expect.poll(controlGap).toBeLessThanOrEqual(4);
});

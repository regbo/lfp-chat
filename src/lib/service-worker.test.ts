import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

type FetchEvent = {
  request: {
    method: string;
    mode: string;
    url: string;
  };
  respondWith(response: Promise<unknown>): void;
  waitUntil(work: Promise<unknown>): void;
};

type InstallEvent = {
  waitUntil(work: Promise<unknown>): void;
};

async function loadServiceWorker(
  fetch: (request: FetchEvent["request"]) => Promise<unknown>,
  caches: Record<string, unknown> = {},
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");

  runInNewContext(source, {
    caches,
    fetch,
    Response,
    self: {
      addEventListener(type: string, listener: (event: unknown) => void) {
        listeners.set(type, listener);
      },
      clients: {},
      location: { origin: "https://chat.pipe.lfpconnect.io" },
      registration: {},
      skipWaiting() {},
    },
    URL,
  });

  return listeners;
}

describe("service worker fetch routing", () => {
  test("does not precache the authenticated root document", async () => {
    let precachedUrls: string[] | undefined;
    let installWork: Promise<unknown> | undefined;
    const listeners = await loadServiceWorker(
      async () => {
        throw new Error("Installation should not fetch through the worker fetch handler");
      },
      {
        async open() {
          return {
            async addAll(urls: string[]) {
              precachedUrls = urls;
            },
          };
        },
      },
    );
    const handler = listeners.get("install") as ((event: InstallEvent) => void) | undefined;
    if (!handler) throw new Error("Service worker did not register an install handler");

    handler({
      waitUntil(work) {
        installWork = work;
      },
    });
    await installWork;

    expect(precachedUrls).not.toContain("/");
    expect(precachedUrls).toContain("/manifest.webmanifest");
  });

  test("leaves root and nested navigations to the browser", async () => {
    const listeners = await loadServiceWorker(async () => {
      throw new Error("The service worker should not fetch a navigation request");
    });
    const handler = listeners.get("fetch") as ((event: FetchEvent) => void) | undefined;
    if (!handler) throw new Error("Service worker did not register a fetch handler");

    for (const pathname of ["/", "/tasks", "/_lfp/auth/logout"]) {
      let response: Promise<unknown> | undefined;
      handler({
        request: {
          method: "GET",
          mode: "navigate",
          url: `https://chat.pipe.lfpconnect.io${pathname}`,
        },
        respondWith(value) {
          response = value;
        },
        waitUntil() {},
      });

      expect(response).toBeUndefined();
    }
  });

  test("continues to intercept same-origin static assets", async () => {
    let response: Promise<unknown> | undefined;
    const listeners = await loadServiceWorker(async () => ({ ok: false }));
    const handler = listeners.get("fetch") as ((event: FetchEvent) => void) | undefined;
    if (!handler) throw new Error("Service worker did not register a fetch handler");

    handler({
      request: {
        method: "GET",
        mode: "no-cors",
        url: "https://chat.pipe.lfpconnect.io/icon-192.png?v=4",
      },
      respondWith(value) {
        response = value;
      },
      waitUntil() {},
    });

    expect(response).toBeDefined();
    await response;
  });
});

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

async function loadFetchHandler(fetch: (request: FetchEvent["request"]) => Promise<unknown>) {
  const listeners = new Map<string, (event: FetchEvent) => void>();
  const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");

  runInNewContext(source, {
    caches: {},
    fetch,
    Response,
    self: {
      addEventListener(type: string, listener: (event: FetchEvent) => void) {
        listeners.set(type, listener);
      },
      clients: {},
      location: { origin: "https://chat.pipe.lfpconnect.io" },
      registration: {},
      skipWaiting() {},
    },
    URL,
  });

  const handler = listeners.get("fetch");
  if (!handler) throw new Error("Service worker did not register a fetch handler");
  return handler;
}

describe("service worker fetch routing", () => {
  test("leaves lfp-pipe authentication endpoints to the network", async () => {
    const handler = await loadFetchHandler(async () => {
      throw new Error("The service worker should not fetch an excluded request");
    });

    for (const pathname of ["/_lfp/auth/logout", "/_lfp/auth/callback?code=oidc-code"]) {
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

  test("continues to intercept regular same-origin navigation", async () => {
    let response: Promise<unknown> | undefined;
    const handler = await loadFetchHandler(async () => ({ ok: false }));

    handler({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://chat.pipe.lfpconnect.io/tasks",
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

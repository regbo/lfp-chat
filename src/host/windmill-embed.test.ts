import { generateKeyPairSync } from "node:crypto";

import { describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";

import { windmillGuestAppUrl, windmillGuestEmail } from "@/host/windmill-embed";
import type { WindmillEmbedViewConfig } from "@/lib/config";

const view: WindmillEmbedViewConfig = {
  id: "home-console",
  label: "Home",
  appPath: "f/llm_queue/digestions",
  placement: "dashboard",
  href: "/dashboard",
};

describe("Windmill guest embeds", () => {
  test("uses a stable guest identity that cannot collide with a Windmill member", () => {
    const user = { resourceId: "user-123", displayName: "Reggie", email: "member@example.com" };
    expect(windmillGuestEmail(user)).toBe(windmillGuestEmail(user));
    expect(windmillGuestEmail(user)).toMatch(/^lfp-chat-[a-f0-9]{24}@guest\.lfpconnect\.internal$/);
    expect(windmillGuestEmail(user)).not.toBe(user.email);
  });

  test("mints a five-minute JWT constrained to the configured app", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = Date.UTC(2026, 8, 12, 12, 0, 0);
    const url = await windmillGuestAppUrl(
      view,
      { resourceId: "user-123", displayName: "Reggie" },
      {
        api: { apiUrl: "https://windmill.example", workspace: "lfpconnect", token: "server-only" },
        privateKey: privatePem,
        now,
        fetchImpl: (async () => new Response("public-secret-123")) as unknown as typeof fetch,
      },
    );
    const encoded = url.pathname.split("/guest.")[1];
    const { payload } = await jwtVerify(encoded, publicKey, {
      algorithms: ["RS256"],
      currentDate: new Date(now),
    });
    expect(url.origin).toBe("https://windmill.example");
    expect(payload.workspace_id).toBe("lfpconnect");
    expect(payload.app_path).toBe(view.appPath);
    expect(payload.exp! - payload.iat!).toBe(300);
  });
});

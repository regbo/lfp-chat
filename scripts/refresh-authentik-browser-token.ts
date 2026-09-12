import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const secretDirectory = process.env.AUTHENTIK_BROWSER_TEST_SECRET_DIR?.trim() ||
  join(homedir(), ".secrets", "lfpconnect.io", "authentik", "lfp-chat-browser-test");
const authentikUrl = (
  process.env.AUTHENTIK_URL?.trim() || "https://auth.lfpconnect.io"
).replace(/\/$/, "");

async function secret(name: string) {
  return (await readFile(join(secretDirectory, name), "utf8")).trim();
}

const response = await fetch(`${authentikUrl}/application/o/token/`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: await secret("client-id"),
    username: await secret("username"),
    password: await secret("app-password"),
    scope: "openid profile email",
  }),
});

if (!response.ok) {
  throw new Error(`Authentik token refresh failed with HTTP ${response.status}.`);
}

const payload = await response.json() as {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};
if (!payload.access_token) throw new Error("Authentik did not return an access token.");

await Promise.all([
  writeFile(join(secretDirectory, "access-token"), payload.access_token, "utf8"),
  writeFile(join(secretDirectory, "token-type"), payload.token_type || "Bearer", "utf8"),
  writeFile(join(secretDirectory, "expires-in"), String(payload.expires_in ?? ""), "utf8"),
  writeFile(join(secretDirectory, "issued-at"), new Date().toISOString(), "utf8"),
]);

console.log(JSON.stringify({
  refreshed: true,
  expiresIn: payload.expires_in,
  tokenFile: join(secretDirectory, "access-token"),
}));

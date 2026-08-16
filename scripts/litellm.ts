import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const host = process.env.LITELLM_HOST?.trim() || "127.0.0.1";
const port = process.env.LITELLM_PORT?.trim() || "4000";
const configPath = resolve(
  process.env.LITELLM_CONFIG?.trim() || "config/litellm.yaml",
);
const tokenDirectory = resolve(
  process.env.CHATGPT_TOKEN_DIR?.trim() ||
    resolve(homedir(), ".secrets", "litellm", "chatgpt"),
);
const liteLlmPackage = "litellm[proxy]==1.97.0";

await mkdir(tokenDirectory, { recursive: true });

// The chat app's PostgreSQL URL is unrelated to LiteLLM and would otherwise
// make the proxy attempt to initialize its optional Prisma management store.
const { DATABASE_URL: _databaseUrl, ...proxyEnvironment } = process.env;
void _databaseUrl;

const child = spawn(
  "uvx",
  [
    "--from",
    liteLlmPackage,
    "--with",
    "fastapi==0.136.3",
    "litellm",
    "--config",
    configPath,
    "--host",
    host,
    "--port",
    port,
  ],
  {
    env: {
      ...proxyEnvironment,
      CHATGPT_TOKEN_DIR: tokenDirectory,
      LITELLM_LOCAL_MODEL_COST_MAP: "True",
      PYTHONUTF8: "1",
      PYTHONUNBUFFERED: "1",
    },
    stdio: "inherit",
  },
);

const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.exitCode = await new Promise<number>((resolveExit, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolveExit(code ?? 1));
});

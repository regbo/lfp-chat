# LFP Chat

A ChatGPT-inspired Mastra chat application with rich tool events and PostgreSQL-backed conversation and working memory.

## Stack

- Next.js 16, React 19, TypeScript, and Tailwind CSS 4
- A standalone Bun/Hono Mastra server on loopback port 4111 that owns the agent, tools, and PostgreSQL memory
- `@mastra/client-js` for run, thread, memory, and streaming operations
- AI Elements for the conversation, messages, reasoning, tools, and prompt input
- Mastra Model Router with provider-specific API keys
- Codex CLI as a separately selectable Mastra ACP coding agent
- Caddy as the single loopback/ZeroTier entrypoint
- Docker Compose for a local PostgreSQL service

## Run locally

Requirements: Bun, Docker, and Node.js 22.13 or newer.

```powershell
Copy-Item .env.example .env.local
# Add your OPENAI_API_KEY to .env.local
# Or set OPENAI_API_KEY_FILE to an existing secret file.

bun install
bun run db:up
bun dev
```

`bun dev` starts three independent processes:

- Caddy entrypoint: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Next.js web client (loopback only): [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Mastra Server (loopback only): [http://127.0.0.1:4111](http://127.0.0.1:4111)

Caddy detects ZeroTier IPv4 interfaces at startup and binds those addresses in addition to loopback without exposing a wildcard listener. With the current interface, the remote URL is `http://100.100.100.126:8080`. Override the port or upstream with `CADDY_PORT` and `CADDY_UPSTREAM`; use `CADDY_EXTRA_BIND_ADDRESSES` for additional comma-separated IPv4 addresses.

The browser uses `MastraClient` with explicit run and thread IDs. Next.js provides a same-origin bridge to the loopback-only Mastra server, so Caddy only needs to proxy the web application.

The default selection is `openai/gpt-5.6-luna`. Swap the server default without changing code by setting `MODEL_PROVIDER`, `MODEL_NAME`, and optionally `REASONING_EFFORT` in `.env.local`. Mastra routes directly to supported providers and reads that provider's standard API-key environment variable. `OPENAI_MODEL` remains a backwards-compatible fallback when the provider is OpenAI and `MODEL_NAME` is unset.

```env
MODEL_PROVIDER=openai
MODEL_NAME=gpt-5.6-luna
REASONING_EFFORT=medium
OPENAI_API_KEY=...
```

The composer also lists **Codex CLI** as an agent rather than a model. Mastra runs it through `@mastra/acp` and `@agentclientprotocol/codex-acp`, while PostgreSQL remains the durable conversation store. Codex runs in an isolated ACP session for each request and defaults to workspace-write access without network access. Configure its boundary explicitly when the server should operate on another repository:

```env
CODEX_AGENT_ENABLED=true
CODEX_AGENT_MODE=agent
CODEX_WORKSPACE_PATH=C:/Users/you/Projects/target-repo
```

Set `CODEX_AGENT_MODE=read-only` for inspection-only use. Full host access is intentionally not exposed by this application configuration.

The Mastra server exposes `GET http://localhost:4111/models`, with a same-origin browser proxy at `GET /api/models`. For OpenAI, the server discovers the models available to the configured API key from OpenAI's `/v1/models` endpoint and caches the filtered chat-model catalog for 10 minutes. Reasoning choices are attached per model family, and the selected model and effort are passed through Mastra request context on every chat run.

Provider-native web search follows the selected OpenAI, Anthropic, Google, or xAI model. OpenAI's code-interpreter and image-generation tools are enabled only for OpenAI models. Mastra creates its PostgreSQL tables automatically on first use.

## Mobile PWA

LFP Chat includes a web app manifest, adaptive icons, safe-area layout, and a network-first service worker. Open the sidebar and choose **Install app**, or use the browser's **Add to Home Screen** action. The application shell is available offline; chat and memory APIs always remain network-only.

## Rich event demo

The included safe tools make the tool-event interface easy to exercise:

- `search` queries built-in project knowledge.
- `calculator` handles basic arithmetic.

Try: “Use both tools to search the stack and calculate 144 divided by 12.” The UI groups concurrent calls into one expandable summary while preserving per-tool inputs, status, output, and errors.

## Commands

```powershell
bun dev             # Start Next.js and Mastra Server together
bun run dev:web     # Start only Next.js
bun run dev:mastra  # Start only the Bun/Hono Mastra Server
bun run dev:caddy   # Start only the Caddy loopback/ZeroTier proxy
bun run caddy:check # Generate and validate the Caddy configuration
bun run db:up       # Start PostgreSQL
bun run db:down     # Stop PostgreSQL
bun run check       # Lint, typecheck, and production build
```

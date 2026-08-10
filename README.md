# LFP Chat

A ChatGPT-inspired Mastra chat application with rich tool events and PostgreSQL-backed conversation and working memory.

## Stack

- Next.js 16, React 19, TypeScript, and Tailwind CSS 4
- A standalone Bun/Hono Mastra server on port 4111 that owns the agent, tools, and PostgreSQL memory
- `@mastra/client-js` for typed memory calls from the Next.js server
- `@mastra/ai-sdk` for a native AI SDK v6 chat endpoint with rich tool events
- AI SDK `useChat` and AI Elements for the conversation, messages, reasoning, tools, and prompt input
- Mastra Model Router with provider-specific API keys
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

`bun dev` starts two independent processes:

- Next.js web client: [http://localhost:3000](http://localhost:3000)
- Mastra Server: [http://localhost:4111](http://localhost:4111)

The browser streams chat from the Mastra server's `/chat` endpoint. Next.js uses `MastraClient` for thread history operations, so the web app never imports or instantiates the agent.

The default selection is `openai/gpt-5.6-luna`. Swap the server default without changing code by setting `MODEL_PROVIDER`, `MODEL_NAME`, and optionally `REASONING_EFFORT` in `.env.local`. Mastra routes directly to supported providers and reads that provider's standard API-key environment variable. `OPENAI_MODEL` remains a backwards-compatible fallback when the provider is OpenAI and `MODEL_NAME` is unset.

```env
MODEL_PROVIDER=openai
MODEL_NAME=gpt-5.6-luna
REASONING_EFFORT=medium
OPENAI_API_KEY=...
```

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
bun run db:up       # Start PostgreSQL
bun run db:down     # Stop PostgreSQL
bun run check       # Lint, typecheck, and production build
```

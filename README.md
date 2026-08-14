# LFP Chat

A ChatGPT-inspired Mastra chat application with rich tool events and PostgreSQL-backed conversation and working memory.

## Package

The reusable chat client is published as `@regbo/lfp-chat`. It exports the client-side `ChatApp` component and a compiled stylesheet:

```tsx
import { ChatApp } from "@regbo/lfp-chat";
import "@regbo/lfp-chat/styles.css";

export default function ChatPage() {
  return <ChatApp />;
}
```

### Add a menu view

Pass self-contained views through the typed `plugins` prop. Each plugin gets a
menu item in both desktop and mobile navigation and a content slot inside the
app shell. Array order controls the order of contributed items.

```tsx
import { ChatApp, type ChatAppPlugin } from "@regbo/lfp-chat";
import { Dashboard } from "./dashboard";

const plugins = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    content: <Dashboard />,
  },
] satisfies readonly ChatAppPlugin[];

export default function ChatPage() {
  return <ChatApp plugins={plugins} />;
}
```

An optional `icon` can be any React node. Plugin IDs and routes must be non-empty
and unique. When `href` is omitted, the route defaults to `/${id}`. The host app
should expose a matching route, while `ChatApp` keeps the shared shell mounted
and displays the plugin content there. Content owns its own data and state, so
interactive plugins can use a Client Component while server-rendered elements
can be passed through the same slot.

### Add an app-wide mod

Use `mods` when an integration spans more than one screen. A mod can contribute
routed views, Settings sections, and entries in the Tools catalog. Contributed
tool IDs are preserved in chat and schedule request context; the host registers
the matching Mastra tools on its server.

```tsx
const homeMod = {
  id: "home",
  views: [{
    id: "tasks",
    href: "/tasks",
    label: "Tasks",
    content: <HomeTasks />,
  }],
  settings: <HomeSettings />,
  tools: [{
    id: "home_task_assignment",
    title: "Task assignment",
    description: "Assign tasks using the home directory.",
    defaultEnabled: true,
  }],
} satisfies ChatAppMod;

<ChatApp mods={[homeMod]} />
```

The legacy `plugins` prop remains available for a single routed view.

The included application gives every primary view a stable URL: `/search`,
`/scheduled`, `/tools`, `/archived`, `/tasks`, and `/settings`. Conversations
remain addressable at `/c/[threadId]`, and `/` always starts a new chat.

Create a release with Bun, then push the generated commit and tag:

```powershell
bun run release patch
git push origin main --follow-tags
```

Tags must use semantic versions such as `v0.2.0`. The GitHub Actions workflow validates the package, derives the npm version from the tag, and publishes it publicly. The private repository secret `NPM_TOKEN` must have permission to publish under the `@regbo` scope.

## Stack

- Next.js 16, React 19, TypeScript, and Tailwind CSS 4
- A standalone Bun/Hono Mastra server on loopback port 4111 that owns the agent, tools, and PostgreSQL memory
- `@mastra/client-js` for run, thread, memory, and streaming operations
- AI Elements for the conversation, messages, reasoning, tools, and prompt input
- Mastra Model Router with provider-specific API keys
- Codex CLI as a separately selectable Mastra ACP coding agent
- Caddy as the single loopback/ZeroTier entrypoint
- Docker Compose for a local PostgreSQL service

### User-scoped memory

Chat memory, schedules, active-run steering, and push subscriptions use a
server-resolved user scope. `USER_SCOPE_MODE=local` retains a browser-local ID
for development. Behind a trusted identity-aware reverse proxy, use
`USER_SCOPE_MODE=header` and select its immutable user identifier with
`USER_SCOPE_HEADER` (Authentik defaults to `x-authentik-uid`). Optional name and
email headers populate the account label without becoming storage keys.

`USER_SCOPE_MODE=jwt` verifies the token from `USER_SCOPE_JWT_HEADER` against
`USER_SCOPE_JWT_JWKS_URL` and `USER_SCOPE_JWT_ISSUER`; an audience can be
required with `USER_SCOPE_JWT_AUDIENCE`. The configured subject claim defaults
to `sub`. Header mode assumes the app port is only reachable through the trusted
proxy that authenticates and replaces those headers.

## Recurring agent work

Scheduling is available both from chat and from the **Scheduled** menu. A request
such as “create a summary of school announcements every Tuesday” is translated
to a timezone-aware Mastra cron schedule. Creation checks the current user's
existing schedules first and returns the covering schedule instead of creating
a duplicate.

New schedules run once immediately before settling into their cadence. Set
`SCHEDULE_RUN_IMMEDIATELY=false`, uncheck **Run once now**, or explicitly ask the
agent to wait when the first run should happen at the scheduled time instead.

Each schedule has its own persisted memory thread. The Scheduled menu can edit
its name, prompt, cron expression, and timezone; pause or resume it; run it
immediately; and expand its trigger history to show outcomes and saved assistant
output. Those private job threads stay out of normal chat history and are opened
from their schedule instead.

An unnamed schedule gets a concise generated title using the same title path as
ordinary chats. Scheduled runs inherit the requesting model, reasoning effort,
and work tools unless the request or Scheduled UI selects another model. A
request for the “most powerful thinking model” resolves to the strongest
available reasoning model and its highest supported effort. Jobs cannot
recursively create schedules. They also receive a job-only memory recall tool
backed by that schedule's thread, so tasks that need continuity or non-repeating
output can inspect prior runs without reading another schedule or an ordinary
conversation.

## Task lists

The **Tasks** route supports multiple independently managed lists. Lists and
tasks can be created, renamed, moved, updated, and deleted from either the UI or
Mastra tools. Task detail includes notes, due date, priority,
timestamps, and generic source links that another project can inject. The
Vikunja adapter keeps its project terminology private, and `VIKUNJA_PROJECT_ID`
is only the backward-compatible default when a list is not specified.
Assignment and other deployment-specific task fields are intentionally absent;
a host can register its own `/tasks` `ChatAppPlugin` when it needs those fields.

## Family and financial context

The `family_database` Mastra tool uses the deployment's read-only family PostgreSQL
connection. In addition to documents, attachments, deadlines, and processing state,
the tool exposes connected financial institutions, accounts, current balances,
transactions, and synchronization history. The agent uses these normalized tables
for exact transaction lookup, merchant/date filters, and spending or cash-flow
aggregation while retaining provider-native JSON for later refinement.

Raw ledger events intentionally remain in PostgreSQL instead of being duplicated
into Graphiti. PostgreSQL is authoritative for exact amounts, dates, pending state,
deduplication, and aggregation; Graphiti remains focused on temporal relationships
derived from ingested household documents, where graph traversal adds more value.

Mastra task creation is idempotent for agents and scheduled jobs. Before a
write, jobs inspect existing open work and reconcile substantially equivalent
tasks. The tool layer also blocks normalized title duplicates in the same list,
matching source-link duplicates across lists, and normalized duplicate list
names. It returns the existing record with `created: false` so a job can update
it instead. Completed tasks remain eligible for intentional recurrence.

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

The application intentionally uses Mastra's standard agent stream instead of maintaining its own Cursor `stream-json` or Codex App Server event adapter.

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

Installed PWAs can receive Web Push notifications when scheduled work finishes,
and scheduled agents have a scoped notification tool for explicit alerts.
Generate VAPID keys with `bunx web-push generate-vapid-keys`, store the private
key outside the repository, and configure `WEB_PUSH_PUBLIC_KEY` plus
`WEB_PUSH_PRIVATE_KEY_FILE`. On iOS, install the app to the Home Screen before
enabling notifications in **Settings**.

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

Any installed dependency can be temporarily replaced by a prepared local package directory. The
directory's `package.json` name must match the requested package; its declared dependencies are
installed without changing the root manifest or lockfile:

```powershell
bun run build:package
bun run local-link --link @regbo/lfp-chat=dist/package
bun run build
```

Repeat `--link package=directory` to overlay more than one dependency. Run `bun install --force` to
restore registry packages afterward. The cluster deployment helper exposes the same local-link
mechanism for isolated Docker builds without modifying this checkout's `node_modules`.

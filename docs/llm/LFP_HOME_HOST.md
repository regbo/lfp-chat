# LFP Home host integration

This repository is a reusable chat package plus an LFP Home host. Preserve that boundary.

- Home's `transaction_add` tool is a host-only native Mastra adapter. It calls the authenticated
  structured Home API and must not reproduce PostgreSQL writes, account matching, deduplication, or
  embeddings. Keep `src/host/transaction-tool.ts` out of public package entrypoints.
- Mastra owns chat history and long-term conversational memory through its PostgreSQL-backed memory
  system. Observational Memory summarizes each thread through the interactive chat provider and
  manages the small resource-scoped working-memory profile. It can run synchronously as an input
  processor when a thread crosses its compression threshold, so do not route it to the slower local
  background model. Ordinary tool results and ingested Home content do not belong in that profile.
- Notifications accept an optional app path or absolute HTTP(S) URL and default to `/`. Use the
  content or result URL when available; reserve `/scheduled` for schedule-management alerts.
- Resource-scoped working memory may retain household access details only after an explicit user
  request. Passwords, API keys, authentication and recovery tokens, private keys, card details, and
  financial credentials remain excluded. Graphiti is reserved for knowledge derived from ingested
  Home sources such as emails, documents, and attachments.
- Sidebar chat links suppress Safari's long-press preview because the row owns its touch actions.
  Running rows use the expanded action-width title fade so loading controls do not cover text.
- Home-managed read tools for PostgreSQL schema, email, attachments, Graphiti, and Kestra remain MCP
  sources. Do not port their clients into this package. Home-only HTTP adapters are appropriate when
  they remain thin clients and preserve native Mastra streaming events.
- The Home chat agent uses the OpenAI-compatible LFP LiteLLM proxy and its cached ChatGPT
  subscription route. Configure `OPENAI_BASE_URL` for the proxy and use a `chatgpt/*` model name.
  The proxy route streams through the Responses API without sending `previous_response_id`;
  Mastra's PostgreSQL transcript remains the source of conversation history.
  Observational Memory uses this same provider because compression can block a foreground turn.
  Local Ollama remains available for nonblocking starter suggestions and scheduled UI assistance.
- The host-only Windmill adapter is read-only. It calls scoped scripts for processing status,
  processed-digestion search, and processed financial-transaction search. It does not submit LLM
  work or expose a generic script runner. Keep the Windmill token file-backed and keep this adapter
  out of public package entrypoints.
- The host may use OpenAI for user-selected chat or explicitly configured structured parsing, but it
  must not introduce OpenAI embeddings into Home or Kestra transaction/content processing.

The corresponding authoritative service state and deployment baseline live in the sibling
`lfp-home/docs/llm/PROJECT_STATE.md` when both repositories are checked out together.

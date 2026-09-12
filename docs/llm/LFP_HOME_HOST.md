# LFP Home host integration

This repository is a reusable chat package plus an LFP Home host. Preserve that boundary.

- Home's `transaction_add` tool is a host-only native Mastra adapter. It calls the authenticated
  structured Home API and must not reproduce PostgreSQL writes, account matching, deduplication, or
  embeddings. Keep `src/host/transaction-tool.ts` out of public package entrypoints.
- Mastra owns chat history and the small resource-scoped working-memory profile through its
  PostgreSQL-backed memory system. Keep Observational Memory disabled while compression failures can
  tripwire the foreground input processor. Ordinary tool results and ingested Home content do not
  belong in the working-memory profile.
- Notifications accept an optional app path or absolute HTTP(S) URL and default to `/`. Use the
  content or result URL when available; reserve `/scheduled` for schedule-management alerts.
- Resource-scoped working memory may retain household access details only after an explicit user
  request. Passwords, API keys, authentication and recovery tokens, private keys, card details, and
  financial credentials remain excluded. Graphiti is reserved for dated, curated knowledge such as
  facts emitted by the Windmill email-digest flow. Raw mailbox bodies do not belong in Graphiti.
- Sidebar chat links suppress Safari's long-press preview because the row owns its touch actions.
  Running rows use the expanded action-width title fade so loading controls do not cover text.
- Home-managed read tools for PostgreSQL schema, email, attachments, and Graphiti remain MCP
  sources. Do not port their clients into this package. Home-only HTTP adapters are appropriate when
  they remain thin clients and preserve native Mastra streaming events.
- The Home chat agent uses the OpenAI-compatible LFP LiteLLM proxy and its cached ChatGPT
  subscription route. Configure `OPENAI_BASE_URL` for the proxy and use a `chatgpt/*` model name.
  The proxy route streams through the Responses API without sending `previous_response_id`;
  Mastra's PostgreSQL transcript remains the source of conversation history.
  Scheduled work and starter suggestions use the same hosted route; there is no local-model fallback.
- The host-only Windmill adapter is read-only. It calls scoped scripts for processing status,
  processed-digestion search, and processed financial-transaction search. It does not submit LLM
  work or expose a generic script runner. Keep the Windmill token file-backed and keep this adapter
  out of public package entrypoints.
- The host uses Together embeddings for Mastra semantic recall and Home retrieval.

The corresponding authoritative service state and deployment baseline live in the sibling
`lfp-home/docs/llm/PROJECT_STATE.md` when both repositories are checked out together.

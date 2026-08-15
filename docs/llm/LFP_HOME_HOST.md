# LFP Home host integration

This repository is a reusable chat package plus an LFP Home host. Preserve that boundary.

- Home's `transaction_add` tool is a host-only native Mastra adapter. It calls the authenticated
  structured Home API and must not reproduce PostgreSQL writes, account matching, deduplication, or
  embeddings. Keep `src/host/transaction-tool.ts` out of public package entrypoints.
- Mastra owns chat history and long-term conversational memory through its PostgreSQL-backed memory
  system. Observational Memory maintains the small resource-scoped user profile with the local
  background model; ordinary tool results and ingested Home content do not belong in that profile.
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
- The host may use OpenAI for user-selected chat or explicitly configured structured parsing, but it
  must not introduce OpenAI embeddings into Home or Kestra transaction/content processing.

The corresponding authoritative service state and deployment baseline live in the sibling
`lfp-home/docs/llm/PROJECT_STATE.md` when both repositories are checked out together.

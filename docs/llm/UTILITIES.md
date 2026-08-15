# Shared utilities

Read `LFP_HOME_HOST.md` before modifying Home-specific host composition.

- `src/lib/browser-mastra-client.ts` — browser-facing Mastra client and per-call agent streaming with explicit run, thread, resource, and abort identity.
- `src/lib/chat-session-store.ts` — shared per-thread transcript/run registry; keeps background streams alive across route and chat selection changes.
- `src/lib/chat-app-plugins.ts` — public plugin contract and registration validation for adding self-contained views to the primary ChatApp menu.
- `src/lib/app-branding.ts` — centralized short/full product naming, favicon configuration, and the palette mirrored from `lfpconnect-assets`; `ChatApp`, metadata, manifests, and agent identity consume its typed branding object.
- `src/lib/config.ts` — typed environment parsing plus shared file-first secret and HTTP URL resolvers; host-only integrations compose these without entering package defaults.
- `src/lib/tool-output.ts` — centralized head/tail truncation for tool values before they enter the visible transcript or model history.
- `src/lib/model-catalog.ts` — model selection, reasoning-effort normalization, and request-context keys.
- `src/lib/tool-catalog.ts` — selectable tool definitions, defaults, and request-context keys.
- `src/mastra/tool-registry.ts` — typed native Mastra tool registry shared by agent resolution, the serialized UI catalog, global Mastra registration, and explicit Monty capability exposure.
- `src/host/transaction-tool.ts` — Home-host composition that calls the authoritative typed transaction API; it is intentionally excluded from the reusable package entrypoints.
- `src/lib/schedules.ts` — shared schedule deduplication, timezone context, and safe scheduled-run request-context construction.
- `src/lib/vikunja.ts` — centralized server-only task client used by chat tools and the Tasks menu.
- `src/lib/dashboard-spec.ts` — persisted widget and validated render-output contracts.
- `src/lib/dashboard-store.ts` — dashboard/tab persistence plus PostgreSQL advisory-lock caching and archive state.
- `src/lib/dashboard-runtime.ts` — generic adapter from real Mastra tools to Monty's allowlisted `tool_call` bridge.
- `src/mastra/dashboard-capabilities.ts` — process-local registration of the default read-oriented Mastra capabilities.
- `src/mastra/dashboard-refresh.ts` — Monty-aware refresh entrypoint kept on the Mastra server side.
- `src/mastra/url-fetch-tool.ts` — SSRF-protected `got-scraping` fetch for one specific public URL; separate from provider web search.
- `src/mastra/tools.ts` — host-neutral built-in project search, calculator, and Monty tools.
- `src/mastra/schedule-tools.ts` — agent-facing list/create scheduling tools with per-resource duplicate prevention and dedicated output threads.
- `src/mastra/writing-style-instructions.ts` — shared default response-writing rules injected into Mastra agents that produce user-visible prose; synchronized with `docs/llm/WRITING_STYLE_INSTRUCTIONS.md` by a focused test.
- `src/lib/thread-state.ts` — thread metadata helpers for folders, pinning, and archiving.
- `src/lib/citations.ts` — citation-marker cleanup and formatting for rendered assistant text.
- `src/lib/mastra-client.ts` — server-only Mastra client used by Next route handlers for memory and thread operations.
- `src/lib/user-scope.ts` — server-side identity resolver for local development IDs, trusted proxy headers, and JWKS-verified JWT claims; API routes use it to reject cross-user resource IDs.
- `scripts/caddy.ts` — generates and validates the local Caddy config, binding only loopback plus detected ZeroTier IPv4 interfaces before proxying to Next.js.
- `src/components/ai-elements/streamdown-renderer.tsx` — lazy rich-text renderer that loads code, Mermaid, math, and CJK plugins only when message content requires them.

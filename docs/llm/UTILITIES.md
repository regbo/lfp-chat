# Shared utilities

- `src/lib/browser-mastra-client.ts` — browser-facing Mastra client and per-call agent streaming with explicit run, thread, resource, and abort identity.
- `src/lib/chat-session-store.ts` — shared per-thread transcript/run registry; keeps background streams alive across route and chat selection changes.
- `src/lib/chat-app-plugins.ts` — public plugin contract and registration validation for adding self-contained views to the primary ChatApp menu.
- `src/lib/tool-output.ts` — centralized head/tail truncation for tool values before they enter the visible transcript or model history.
- `src/lib/model-catalog.ts` — model selection, reasoning-effort normalization, and request-context keys.
- `src/lib/tool-catalog.ts` — selectable tool definitions, defaults, and request-context keys.
- `src/mastra/tools.ts` — safe built-in tools, including read-only family SQL and Graphiti search with bounded outputs and timeouts.
- `src/lib/thread-state.ts` — thread metadata helpers for pinning and archiving.
- `src/lib/citations.ts` — citation-marker cleanup and formatting for rendered assistant text.
- `src/lib/mastra-client.ts` — server-only Mastra client used by Next route handlers for memory and thread operations.
- `scripts/caddy.ts` — generates and validates the local Caddy config, binding only loopback plus detected ZeroTier IPv4 interfaces before proxying to Next.js.
- `src/components/ai-elements/streamdown-renderer.tsx` — lazy rich-text renderer that loads code, Mermaid, math, and CJK plugins only when message content requires them.

# Deterministic tools and dashboards

## Boundary

Saved tools own data access, composition, and caching. Dashboard widgets only
invoke one saved tool with fixed JSON input and present its output. Neither path
invokes an LLM after the model authors and saves the code.

A saved tool receives `args` and `now`, returns any JSON-compatible value, and
may call declared built-in or saved tools:

```python
response = await tool_call("url_fetch", {
    "url": "https://lorem-api.com/api/lorem",
})
{"quote": response["body"]}
```

Saved tool calls are bounded to six nested levels and 32 total invocations.
The shared counter reserves exactly one slot before each call. Calling the same
tool again with the same input in one chain is rejected, while recursion with
changing inputs is allowed.

## Cache

`cacheTtlSeconds` applies a PostgreSQL cache to the complete saved-tool output.
Keys are SHA-256 hashes of `safe-stable-stringify` output, so object key order at
any nesting depth does not change the cache identity. Different input values do.

Cache misses use a transaction-scoped PostgreSQL advisory lock and double-check
the value after acquiring it. Concurrent misses for the same tool input produce
one computation. Commit, rollback, or connection failure releases the lock.

The default `cache` Mastra capability also provides resource-scoped `get`, `set`,
and `delete` operations for intermediate or shared values. Use namespaced keys.
The automatic complete-output cache remains the preferred stampede-safe path.

## Mastra adaptation

`registerDashboardMastraTools()` adapts actual Mastra tools. Their IDs, input
schemas, and execute handlers remain authoritative. A saved tool must declare
every dependency in `capabilities`; registration and the saved allowlist are
independent checks.

Defaults include project search, calculator, Monty, `web_fetch`, browser-like
`url_fetch`, `cache`, and optional read-only `sql_query`. `url_fetch` uses
`got-scraping` and blocks private, loopback, link-local, carrier NAT, multicast,
and reserved destinations on the DNS lookup path.

## Dashboard presentation

A widget stores:

- `toolName`: exactly one saved tool
- `toolInput`: fixed JSON-compatible input
- `code`: Monty presentation code

Every dashboard mount invokes the saved tool. The saved tool decides whether its
TTL or explicit cache can return data without repeating source work. The widget
has no cache, polling interval, or arbitrary tool access.

Presentation code receives `data`, `input`, and `now`, then returns one validated
`chart`, `metric`, `table`, or `text` value. Text may use the constrained `css`
fields `fontWeight`, `fontStyle`, and `textAlign`. The browser never evaluates
generated JavaScript, HTML, React, or arbitrary CSS.

## UI and lifecycle

- Dashboard navigation appears only while a widget record exists.
- Widgets are archived, restored, and permanently deleted from Dashboard.
- Saved tools live under Tools, where each has an Info button with highlighted
  source code, dependencies, TTL, archive, restore, and permanent delete.
- A manual widget refresh forces the saved tool's automatic output cache to
  recompute; ordinary dashboard loads honor the tool TTL.
- The repository contains no deployment-specific or domain-specific data tool.

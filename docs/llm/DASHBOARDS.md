# Deterministic dashboards

## Contract

A dashboard widget is persisted application code, not a saved model response.
The chat model authors a Monty Python program once through
`dashboard_upsert_widget`. Refreshes then execute that program without invoking
a model.

Each program returns one validated value:

- `chart`: line or bar data with aligned labels and series
- `metric`: a scalar plus optional detail and trend
- `table`: bounded columns and rows
- `text`: bounded plain text

The browser never evaluates generated JavaScript or renders generated React.
It only renders the validated data contract.

## Mastra tool adaptation

Programs call a single host bridge:

```python
rows = await tool_call("sql_query", {
    "sql": "SELECT month, total FROM monthly_spend ORDER BY month"
})

{
    "kind": "chart",
    "chartType": "line",
    "title": "Monthly spend",
    "labels": [row["month"] for row in rows["rows"]],
    "series": [{
        "name": "Spend",
        "values": [row["total"] for row in rows["rows"]],
    }],
    "unit": "currency",
    "currency": "USD",
}
```

`registerDashboardMastraTools()` accepts actual Mastra tool objects. Their IDs,
descriptions, input schemas, and execute handlers remain authoritative. The
adapter converts Monty maps to JavaScript objects, validates Zod inputs, and
constructs a resource-scoped Mastra execution context. A widget must also list
every tool it may call in its persisted `capabilities` array. Registration and
the per-widget allowlist are independent checks.

The default registry contains read-oriented tools only: project search,
calculator, Monty, Mastra's safe `web_fetch`, browser-like `url_fetch`, and the
optional generic `sql_query`. A host can register any other Mastra tool in both
the web and Mastra server processes. Mutating tools should only be registered
when repeated execution is explicitly safe and idempotent.

`url_fetch` is deliberately different from provider web search. It retrieves a
specific public URL with `got-scraping` browser headers and TLS behavior. DNS is
checked on the actual lookup path and private, loopback, link-local, carrier NAT,
multicast, and reserved addresses are rejected.

## Cache and refresh flow

The refresh path is:

1. Read the widget and return an unexpired value immediately.
2. Begin a PostgreSQL transaction.
3. Derive a signed 64-bit advisory-lock key from resource ID and widget ID.
4. Acquire `pg_advisory_xact_lock`.
5. Read the cache again. A waiting replica returns the value produced by the
   lock holder instead of recomputing it.
6. Execute Monty and its allowed Mastra tools.
7. Validate output, persist it with its expiration, and commit.

The lock is released automatically by commit, rollback, or connection failure.
Concurrent forced refreshes also compare the last-run timestamp observed before
the lock, so only the first request recomputes.

Programs receive `cache_get()` and `cache_age_seconds()` for incremental or
stale-aware behavior. `cacheTtlSeconds=0` disables reuse. `lazy=true` leaves the
first run to the user. A page load calls the program only when its cached value
is missing or expired. `refreshIntervalSeconds` is optional and must be set only
when the user explicitly requests automatic polling. Interval and button
refreshes deliberately bypass a still-valid TTL; the database advisory lock
still collapses simultaneous browser and server-replica refreshes into one
computation.

## UI and lifecycle

- Dashboard navigation is hidden until a widget record exists.
- The default tab is named Dashboard.
- The tab strip is hidden while only one tab is visible.
- Widgets and entire tabs can be archived and restored.
- Archived records keep the Dashboard menu discoverable.
- Widget programs are updated by stable ID or by matching title in a tab.
- Updating code or capabilities invalidates the cached output.

## Extension patterns

- API monitoring: adapt an authenticated host API tool and refresh status
  metrics every few minutes.
- Multi-step transforms: fetch several sources concurrently through tool calls,
  then join or aggregate in Monty.
- Incremental polling: retain a cursor or prior aggregate in `cache_get()`.
- Expensive analytics: combine a long TTL with manual refresh.
- Snapshot dashboards: set no refresh interval and archive the widget when the
  investigation ends.
- Tenant-specific data: use the resource ID supplied in the Mastra tool context;
  never accept a tenant ID from generated code as authority.

The repository intentionally contains no deployment-specific schema or domain
tool. A consuming application owns those adapters and their credentials.

# Playwright smoke harness

The browser smoke suite exercises the recurring responsive UI risks against the
real Next.js application shell. Browser-facing APIs are intercepted with
deterministic fixtures, so PostgreSQL, Mastra, provider credentials, and the
separate Mastra development server are not required.

## Coverage

- desktop Chromium and an iPhone-sized mobile WebKit project;
- visual viewport resize/offset behavior while the mobile composer is focused;
- independent sidebar overflow and access to its bottom account row;
- immediate and persisted light/dark theme selection;
- expanded multi-tool input, output, and error content without shell overflow.

The visual viewport fixture replaces `window.visualViewport` before application
code runs, then dispatches the resize, scroll, and scroll-end events used by the
production hook. It validates the app's geometry response; it does not attempt
to automate a native on-screen keyboard.

## Commands

Install the pinned browser engines once after `bun install`:

```powershell
bun run smoke:install
```

Run both projects, or select one during iteration:

```powershell
bun run smoke
bun run smoke --project=desktop-chromium
bun run smoke --project=mobile-webkit
```

Playwright uses the app's standard port `3000` and reuses an answering server
outside CI. Otherwise it starts `bun run dev:web` itself. Set `PLAYWRIGHT_PORT`
when that port is unavailable and no other Next.js process is running from this
checkout. Failure screenshots and traces are written under the ignored
`test-results` directory.

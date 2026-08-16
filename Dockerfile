# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-slim AS bun

FROM node:22-bookworm-slim AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG DEPENDENCY_REFRESH=false
ARG DEPENDENCY_REFRESH_TOKEN=locked
ARG LOCAL_LINKS=false
# A refreshed deployment deliberately crosses the 0.x minor boundary for the
# reusable chat package, then refreshes all other dependencies within their ranges.
RUN if [ "$DEPENDENCY_REFRESH" = "true" ]; then \
      echo "Refreshing dependencies for $DEPENDENCY_REFRESH_TOKEN" && \
      bun update @regbo/lfp-chat --latest && bun update; \
    fi
RUN case "$LOCAL_LINKS" in \
      false) ;; \
      true) bun run local-link --manifest .lfp-local-links/manifest.json ;; \
      *) echo "LOCAL_LINKS must be true or false" >&2; exit 1 ;; \
    esac
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Monty's prebuilt Linux addon requires glibc 2.38 or newer. Debian Trixie
# satisfies that constraint; Bun runs both the verified Next adapter output and Mastra.
FROM debian:trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --chown=65532:65532 --from=build /app/.next/standalone ./
COPY --chown=65532:65532 --from=build /app/.next/static ./.next/static
COPY --chown=65532:65532 --from=build /app/public ./public
COPY --chown=65532:65532 --from=build /app/dist/server ./dist/server
COPY --chown=65532:65532 --from=build /app/node_modules/@pydantic ./node_modules/@pydantic
# got-scraping bundles header-generator code, but it loads browser header data at runtime.
COPY --chown=65532:65532 --from=build /app/node_modules/header-generator/data_files ./node_modules/header-generator/data_files
COPY --chown=65532:65532 --from=build /app/scripts/start-container.ts ./scripts/start-container.ts
USER 65532:65532
EXPOSE 3000 4111
CMD ["bun", "scripts/start-container.ts"]

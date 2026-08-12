# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-slim AS bun

FROM node:22-bookworm-slim AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG DEPENDENCY_REFRESH=false
ARG DEPENDENCY_REFRESH_TOKEN=locked
# A refreshed deployment deliberately crosses the 0.x minor boundary for the
# reusable chat package, then refreshes all other dependencies within their ranges.
RUN if [ "$DEPENDENCY_REFRESH" = "true" ]; then \
      echo "Refreshing dependencies for $DEPENDENCY_REFRESH_TOKEN" && \
      bun update @regbo/lfp-chat --latest && bun update; \
    fi
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Monty's prebuilt Linux addon requires glibc 2.38 or newer. Debian Trixie
# satisfies that constraint for the Mastra runtime while keeping Node 22.
FROM node:22-trixie-slim AS runtime
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/dist/server ./dist/server
COPY --chown=node:node --from=build /app/node_modules/@pydantic ./node_modules/@pydantic
USER node
EXPOSE 3000 4111
CMD ["node", "server.js"]

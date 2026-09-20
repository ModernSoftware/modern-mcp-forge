# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MCP_FORGE_DATA_DIR=/data

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && mkdir -p /data /workspace

COPY --from=build /app/build ./build

VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "build/index.js"]

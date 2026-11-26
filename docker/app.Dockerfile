# syntax=docker/dockerfile:1
# Single image for app, worker and migrate (runtime stage) plus a "dev" stage used by the
# "tools" service (lint, typecheck, tests). Multi-arch: linux/amd64 and linux/arm64.
# TypeScript runs natively on Node.js (type stripping): there is no build step.

ARG NODE_IMAGE=node:26.13.1-trixie-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false \
  NPM_CONFIG_AUDIT=false

# All dependencies (dev included) — used by the tools/dev stage.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Production dependencies only.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Dev/tools stage: lint, typecheck and tests run here so the host only needs Docker.
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "test:unit"]

# Runtime stage: app (default), worker and migrate share it.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/main.ts"]

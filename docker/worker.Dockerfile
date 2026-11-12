# syntax=docker/dockerfile:1.7
# Worker image of the self-hosted stack (SPEC-012, EF-1, ET-1).
# `apps/worker/build.mjs` bundles the Hono server and the shared Inngest registry into one ESM
# file, so the runtime stage contains no dependency tree and no build tool. It runs as `node`.
ARG NODE_IMAGE=node:24.22.3-alpine3.24

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /repo

FROM base AS deps
# Manifests only: the lockfile install layer is reused as long as dependencies do not change.
# Add a line when a new workspace package appears.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/learning-engine/package.json ./packages/learning-engine/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/services/package.json ./packages/services/package.json
COPY packages/testing/package.json ./packages/testing/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @learny/worker...

FROM base AS builder
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
ENV APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .
RUN pnpm --filter @learny/worker build

FROM ${NODE_IMAGE} AS runner
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
LABEL org.opencontainers.image.title="learny-worker" \
      org.opencontainers.image.description="Learny Inngest worker (Hono, self-hosted)" \
      org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_COMMIT} \
      org.opencontainers.image.source="https://github.com/hckmn732/learny"
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY --from=builder --chown=root:root /repo/apps/worker/dist ./dist
COPY --from=builder --chown=root:root /repo/apps/worker/package.json ./package.json
COPY --chown=root:root docker/healthcheck-worker.mjs ./healthcheck.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "dist/server.mjs"]

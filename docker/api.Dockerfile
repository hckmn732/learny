# syntax=docker/dockerfile:1.7
# Learny API and Inngest functions run in the same Node process (ADR-1002, SPEC-1103).
ARG NODE_IMAGE=node:24.22.3-alpine3.24

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/api-routes/package.json ./packages/api-routes/package.json
COPY packages/automations/package.json ./packages/automations/package.json
COPY packages/bricks/package.json ./packages/bricks/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/http/package.json ./packages/http/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/ingestion/package.json ./packages/ingestion/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/learning-engine/package.json ./packages/learning-engine/package.json
COPY packages/llm/package.json ./packages/llm/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/services/package.json ./packages/services/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tutor/package.json ./packages/tutor/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @learny/api...

FROM base AS builder
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
ENV APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .
RUN pnpm --filter @learny/api build \
    && pnpm --filter @learny/api deploy --legacy /repo/deploy

FROM ${NODE_IMAGE} AS runner
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
LABEL org.opencontainers.image.title="learny-api" \
      org.opencontainers.image.description="Learny Hono API and Inngest worker" \
      org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_COMMIT} \
      org.opencontainers.image.source="https://github.com/hckmn732/learny"
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY --from=builder --chown=root:root /repo/apps/api/dist ./dist
COPY --from=builder --chown=root:root /repo/apps/api/package.json ./package.json
COPY --chown=root:root docker/healthcheck-api.mjs ./healthcheck-api.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "/app/healthcheck-api.mjs"]
CMD ["node", "dist/server.mjs"]

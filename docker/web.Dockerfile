# syntax=docker/dockerfile:1.7
# Web image of the self-hosted stack (SPEC-012, EF-1, ET-1, ET-2).
# Multi-stage build: install from the frozen lockfile, build Next.js in `standalone` mode, then
# copy only the runtime output. The final stage runs as the unprivileged `node` user and receives
# no secret: only public NEXT_PUBLIC_* values are accepted as build arguments (EF-3, ET-5).
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
COPY packages/bricks/package.json ./packages/bricks/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/learning-engine/package.json ./packages/learning-engine/package.json
COPY packages/llm/package.json ./packages/llm/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/services/package.json ./packages/services/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @learny/web...

FROM base AS builder
ARG NEXT_PUBLIC_APP_URL="http://localhost:8080"
ARG NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .
RUN pnpm --filter @learny/web build

FROM ${NODE_IMAGE} AS runner
ARG APP_VERSION="dev"
ARG GIT_COMMIT="unknown"
LABEL org.opencontainers.image.title="learny-web" \
      org.opencontainers.image.description="Learny web application (Next.js standalone, self-hosted)" \
      org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_COMMIT} \
      org.opencontainers.image.source="https://github.com/hckmn732/learny"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Only the traced standalone output, the static assets, the public files and the probe are copied.
COPY --from=builder --chown=root:root /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=root:root /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=root:root /repo/apps/web/public ./apps/web/public
COPY --chown=root:root docker/healthcheck-web.mjs ./healthcheck-web.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "/app/healthcheck-web.mjs"]
CMD ["node", "apps/web/server.js"]

# syntax=docker/dockerfile:1.7
# Job `seed` de la pile de QA Coolify (docker/compose.coolify-qa.yml) : charge le jeu de
# démonstration SPEC-115 (packages/db/src/seed, `pnpm db:seed:demo`) dans la base de la pile.
# Jamais utilisé par la production. La garde de la seed (APP_ENV local/test, hôte local ou `.test`,
# horloge figée) s'applique telle quelle avant toute écriture.
ARG NODE_IMAGE=node:24.22.3-alpine3.24

FROM ${NODE_IMAGE}
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /repo

# Tous les manifestes : l'installation figée vérifie l'espace de travail complet. Ajouter une ligne
# quand un nouveau paquet apparaît (comme docker/web.Dockerfile).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/api-routes/package.json ./packages/api-routes/package.json
COPY packages/automations/package.json ./packages/automations/package.json
COPY packages/bricks/package.json ./packages/bricks/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/ingestion/package.json ./packages/ingestion/package.json
COPY packages/http/package.json ./packages/http/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/learning-engine/package.json ./packages/learning-engine/package.json
COPY packages/llm/package.json ./packages/llm/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/services/package.json ./packages/services/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tutor/package.json ./packages/tutor/package.json
COPY packages/ui/package.json ./packages/ui/package.json
# `@learny/db` et ses dépendances, plus la racine pour `tsx` (exécution du CLI TypeScript).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@learny/db..." --filter learny

COPY tsconfig.base.json ./
COPY packages/config ./packages/config
COPY packages/core ./packages/core
COPY packages/db ./packages/db

USER node
CMD ["pnpm", "exec", "tsx", "packages/db/src/seed/cli.ts"]

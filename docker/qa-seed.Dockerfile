# syntax=docker/dockerfile:1.7
# Job `seed` de la pile de QA Coolify (docker/compose.coolify-qa.yml) : charge le jeu de
# démonstration SPEC-115 (packages/testing/src/db/seed, `pnpm db:seed:demo`) dans la base de la pile.
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
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/api-sdk/package.json ./packages/api-sdk/package.json
COPY packages/bricks/package.json ./packages/bricks/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/ui/package.json ./packages/ui/package.json
# `@learny/testing` (la seed) et ses dépendances, plus la racine pour `tsx`.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@learny/testing..." --filter learny

COPY tsconfig.base.json ./
COPY packages/config ./packages/config
COPY packages/core ./packages/core
COPY packages/db ./packages/db
COPY packages/api-client ./packages/api-client
COPY packages/contracts ./packages/contracts
COPY packages/testing ./packages/testing

USER node
CMD ["pnpm", "exec", "tsx", "packages/testing/src/db/seed/cli.ts"]

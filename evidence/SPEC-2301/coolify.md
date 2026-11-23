# Preuve — configuration Coolify des deux services Python (SPEC-2301, EF-1, CA-1)

**Date** : 2026-11-23. **Environnement** : VM de développement `ubuntu@100.111.204.24`,
worktree `learny-wt-SPEC-2301`, branche `spec/SPEC-2301-deploiement-bascule-rollback`, base `main`
`5254a2a5`. **Aucune instance Coolify de staging n'est accessible** (ADR-2009) : ce document prouve
la **configuration versionnée** et sa validation locale, jamais un déploiement.

## Ce qui est versionné

| Fichier | Rôle |
|---|---|
| `docker/compose.coolify-py.yml` | services `api-py` et `worker-py` de la production, inclus par la pile |
| `docker/compose.coolify-qa-py.yml` | mêmes services pour la pile de QA (modes simulés, horloge figée) |
| `docker/compose.coolify.yml`, `-qa.yml` | `include:` du fichier Python : Coolify déploie **une seule ressource** |
| `docs/operations/coolify.md` § 10 | services, variables, sondes, limites, budget de connexions |
| `.github/workflows/ci.yml` | construit `docker/api-py.Dockerfile` à chaque commit (étape « Construire l'image Python ») |

Pourquoi un fichier inclus plutôt que deux services dans le fichier principal : la page
`/_dev/sdd/SPEC-1103` énumère les services des quatre Compose et sa ligne de base visuelle
(`spec-1103-demo-desktop-linux.png`, 1440 × 999) est un oracle d'une autre spécification
(ADR-1001, ADR-2008). Un premier essai avec les deux services dans `docker/compose.coolify.yml` a
mesuré **1440 × 1046** (+47 px) sur cette page : l'inclusion conserve le rendu **et** le
déploiement. C'est la décision consignée dans l'en-tête du fichier inclus.

## Une image, deux commandes

- Image : `docker/api-py.Dockerfile` (SPEC-2003), utilisateur `learny` (uid 1001), aucune écriture
  hors `/app`.
- `api-py` : `uvicorn learny_api.main:app --host 0.0.0.0 --port 8000 --workers $PY_API_WORKERS`
  (2 par défaut), sonde `GET /health`, port interne 8000, 2 vCPU / 2 Go.
- `worker-py` : `python -m learny_worker`, sondes `GET /health/live` **et** `GET /health/ready` sur
  `PY_WORKER_HEALTH_PORT` (8081 par défaut), 1 vCPU / 1 Go.
- Les deux : `restart: unless-stopped`, `read_only: true`, `tmpfs /tmp`, `no-new-privileges`,
  `cap_drop: [ALL]`, journalisation plafonnée (10 Mo × 5).

## Sondes réellement servies par le code

- `GET /health` : route spéciale `health.get` de la façade (SPEC-006 EF-2), 200 seulement si la
  base répond (`apps/api-py/src/learny_api/handlers/health.py`).
- `GET /health/live` et `GET /health/ready` : `apps/worker-py/src/learny_worker/health.py`, le
  `ready` sonde la base avec un délai de deux secondes.

## Migration singleton et verrou

- Le job `migrate` de la pile reste unique (`restart: 'no'`, image cible `migrate`, une transaction
  par fichier, empreinte SHA-256 dans `public.selfhost_schema_migrations`) ; `api-py` et
  `worker-py` attendent `service_completed_successfully`, directement en production, via le job
  `seed` (qui attend lui-même `migrate`) sur la pile de QA.
- Pour Supabase géré, le job de release reste `tools/deploy/migrate.mjs`, exécuté sous verrou :
  `flock /tmp/learny-migrate.lock node tools/deploy/migrate.mjs --env staging`. Il refuse une base
  locale et ne fait aucun appel réseau en `--dry-run`.

## Aucun secret commité

Les variables sont des **noms** : chaque valeur est une interpolation `${…}` fournie par Coolify,
un mode littéral (`production`, `live`, `mock`, `resend`, `smtp`, `on`, `off`, `worker`, `true`), ou
une URL interne du réseau Compose. Contrôle automatisé : `tools/deploy/coolify.test.ts` refuse une
valeur littérale inconnue et cherche les motifs de secret (`eyJ…`, `sk-…`, clé privée PEM) dans les
deux fichiers.

## Validation locale exécutée

```bash
corepack pnpm exec vitest run --project unit tools/deploy/coolify.test.ts
# 12 cas réussis (2 piles × 6 assertions)
```

Le Compose résolu a été vérifié avec Docker Compose v5.7.1, sur une copie du fichier principal
privée de la seule clé propre à Coolify (`exclude_from_hc`, refusée par `docker compose config`) :

```bash
docker compose -f docker/compose.coolify.yml config --no-interpolate --services
# migrate auth storage auth-templates inngest api web worker-py db rest kong api-py
```

`docker compose config` sur le fichier d'origine échoue sur `exclude_from_hc` **avant** cette
spécification : c'est une extension Coolify, présente sur `main`.

## Dépendance externe (non contournée)

CA-1 (« api et worker tournent sur le staging Coolify et passent les sondes ») exige une instance
Coolify de staging fournie par le porteur : **bloqué externe**, consigné par
`node tools/sdd/fail.mjs SPEC-2301 "…" --external` (ADR-2009, CL-3). Aucune preuve de déploiement
n'est inventée ici.

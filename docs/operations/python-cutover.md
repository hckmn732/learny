# Runbook — exploitation du backend Python, rollback et restauration (SPEC-2301, SPEC-2302)

Ce runbook est la **procédure écrite** d'exploitation du backend Python (ADR-2007, ADR-2043). Depuis
SPEC-2302, la production est servie par **deux services seulement** — `api-py` (façade FastAPI) et
`worker-py` (outbox, livraisons, crons) — avec `web` et le job `migrate`. Il n'y a **plus** de Hono,
plus d'Inngest, plus de relais, plus de `OWNERSHIP_OVERRIDES`, plus de bascule par contexte ni de
rollback de relais : une entrée du contrat est servie par Python ou n'existe pas (la façade refuse
de démarrer si une opération n'a pas de handler).

Ce qui reste vrai et normatif ici : le déploiement, la santé, le drain du worker, le **rollback de
déploiement** (retour à l'image précédente) et la **restauration** d'une sauvegarde.

## 0. Préalables

```bash
export COOLIFY_COMPOSE=/chemin/vers/compose.coolify.yml   # pile résolue par Coolify
export APP_URL=https://<domaine-du-web>
export API_URL=https://<domaine-de-api-py>
```

L'image est unique (`docker/api.Dockerfile`, SPEC-2003) et la CI la construit à chaque commit
(`.github/workflows/ci.yml`, `ghcr.io/<owner>/learny-py:<sha>`).

## 1. Déployer une version

```bash
# a. Migrations d'abord : le job `migrate` est un singleton et s'arrête après application.
docker compose -f "$COOLIFY_COMPOSE" run --rm --no-deps migrate

# b. Les deux services du backend, même image, commandes différentes.
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py worker-py

# c. Le web en dernier (il pointe sur http://api-py:8000).
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps web
```

**Critère de promotion** : `api-py` sain sur `GET /health` et `GET /api/v1/health`, `worker-py` sain
sur `/health/live` et `/health/ready`, et aucune livraison `failed` nouvelle pendant 30 minutes.

## 2. Vérifier la santé

```bash
curl -fsS "$API_URL/health"
curl -fsS "$API_URL/api/v1/health"
docker compose -f "$COOLIFY_COMPOSE" ps api-py worker-py
docker compose -f "$COOLIFY_COMPOSE" logs --tail=200 api-py worker-py
```

Retard de l'outbox (le worker réclame `event_outbox` → `job_deliveries`) :

```sql
select
  count(*) filter (where sent_at is null and not failed) as en_attente,
  count(*) filter (where failed)                        as echoues,
  min(created_at) filter (where sent_at is null and not failed) as plus_ancien
from public.event_outbox;

select status, count(*), min(created_at)
from public.job_deliveries
where status <> 'done'
group by status;
```

**Critère** : aucune livraison `failed` non expliquée, plus ancien événement en attente < 2 min.

## 3. Drainer le worker (maintenance, restauration, rollback)

Le worker est le seul écrivain des livraisons : on le draine avant toute opération qui change la
base ou l'image.

```bash
# a. Arrêt de la réclamation : SIGTERM, le worker finit ses lots en cours (45 s au plus).
docker compose -f "$COOLIFY_COMPOSE" stop -t 60 worker-py

# b. Attente de fin de lot et vérification de l'outbox (conteneur jetable, même image, même réseau).
docker compose -f "$COOLIFY_COMPOSE" run --rm --no-deps worker-py \
  python -m learny_worker.drain --wait 60 --require-empty
```

Codes de sortie : `0` = file vide ; `1` = au moins un événement en attente, en cours, en échec, non
réparti (`undispatched`) ou estampillé sans livraison (`orphaned`). Dans ce cas : redémarrer le
worker (`up -d worker-py`), laisser la file se vider, recommencer.

En local, sans Docker :

```bash
uv run python -m learny_worker.drain --wait 30 --require-empty --json
```

## 4. Rollback de déploiement

Le rollback est un **retour à l'image précédente**, pas un changement de runtime : il n'y a plus de
second backend vers lequel revenir.

```bash
# a. Redéployer le SHA précédent sur les deux services (même image, même configuration).
IMAGE_TAG=<sha-précédent> docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py worker-py

# b. Vérifier la santé et une lecture par service.
curl -fsS "$API_URL/api/v1/health"
curl -fsS "$APP_URL/api/v1/me" -H "Cookie: $SESSION"   # ou un Bearer de test

# c. Consigner l'heure, le SHA et les mesures brutes dans evidence/SPEC-2301/.
```

Ce que le rollback **ne fait pas** : il ne défait pas une migration appliquée. Si la version
déployée a changé le schéma, restaurer d'abord la sauvegarde (§ 6) ou appliquer une migration
compensatoire écrite et testée — jamais de `down` improvisé en production.

## 5. Arrêt d'urgence (incident en cours)

```bash
# 1. Drainer le worker : plus aucune écriture de livraison.
docker compose -f "$COOLIFY_COMPOSE" stop -t 60 worker-py

# 2. Revenir à l'image précédente de la façade, ou l'arrêter si elle est la cause.
IMAGE_TAG=<sha-précédent> docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py

# 3. Mesurer l'impact avant toute autre action.
curl -fsS -o /dev/null -w '%{http_code}\n' "$API_URL/api/v1/health"
```

Aucun secret n'est imprimé : les variables restent dans Coolify.

## 6. Restauration d'une sauvegarde (staging)

Deux chemins, selon la sauvegarde disponible. Les deux se font **sans toucher la production** et se
chronomètrent. Ils exigent le client PostgreSQL (`apt-get install -y postgresql-client`) sur l'hôte
d'où la commande est lancée.

### a. Sauvegarde logique `pg_dump` / `pg_restore` dans une base de travail

```bash
time pg_dump --format=custom --no-owner --no-privileges \
  "$STAGING_DATABASE_URL" --file /tmp/staging.dump

createdb -h <hôte> -U postgres learny_restore_check
time pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://postgres:<mot-de-passe>@<hôte>:5432/learny_restore_check" /tmp/staging.dump
```

### b. PITR Supabase (staging managé)

Dans le tableau de bord Supabase du staging : *Database → Backups → Restore*, choisir l'instant,
restaurer dans un projet ou une branche de travail, jamais dans la production.

### Vérification (les deux chemins)

```bash
RESTORED="postgresql://postgres:<mot-de-passe>@<hôte>:5432/learny_restore_check"
for table in profiles formations modules chapters schedule_slots event_outbox job_deliveries; do
  printf '%s ' "$table"
  psql "$RESTORED" -tAc "select count(*) from public.$table"
done
# Contrôle de contenu (mêmes données, même empreinte) sur les tables de référence.
for table in profiles formations modules; do
  psql "$STAGING_DATABASE_URL" -tAc "select md5(string_agg(t::text, '' order by t::text)) from public.$table t"
  psql "$RESTORED" -tAc "select md5(string_agg(t::text, '' order by t::text)) from public.$table t"
done
```

Puis les contrôles de fumée de l'API sur la copie restaurée, avec `DATABASE_URL="$RESTORED"` :

```bash
DATABASE_URL="$RESTORED" uv run uvicorn learny_api.main:app --port 8099 &
curl -fsS http://127.0.0.1:8099/health
curl -fsS http://127.0.0.1:8099/api/v1/health
kill %1
```

**Critère** : les comptes des tables de référence sont égaux, les empreintes aussi, `/health` et
`/api/v1/health` répondent 200. Consigner la durée des deux commandes `time`.

## 7. Liste de contrôle d'incident

1. Constater : 5xx, p95, plus ancienne livraison en attente, livraisons `failed` (§ 2).
2. Décider : rollback de déploiement (§ 4) ou arrêt d'urgence (§ 5).
3. Drainer le worker avant toute opération sur la base (§ 3).
4. Vérifier la façade (`/health`, `/api/v1/health`) et une lecture authentifiée.
5. Consigner l'heure, le SHA, les mesures brutes dans `evidence/SPEC-2301/`.

## 8. Ce qui est prouvé en local, ce qui exige le staging

| Preuve | Environnement | Statut |
|---|---|---|
| Couverture du contrat : chaque opération et route spéciale a un handler Python | local (`test_route_coverage.py`, `inventory.mjs --runtime`) | prouvé |
| Consommateurs et crons servis par Python, aucun paquet backend TypeScript | local (`inventory.mjs --check`) | prouvé |
| Drain du worker et rejeu sans perte d'événement ni double mutation | local (PostgreSQL local, worker) | prouvé |
| Restauration logique dans une base de travail (`pg_dump`/`pg_restore`) | local | prouvé sur une base de développement |
| Sondes et services Coolify, rollback chronométré sous charge, restauration chronométrée du staging, budgets de charge | staging fourni par le porteur | **bloqué externe** (ADR-2009) |

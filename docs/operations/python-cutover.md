# Runbook — bascule Python, arrêt d'urgence, rollback et restauration (SPEC-2301)

Ce runbook est la **procédure écrite** de la bascule du runtime Python (ADR-2007, ADR-2005). Chaque
étape est réversible et porte son **critère d'arrêt** : aucune étape ne commence avant que la
précédente ait atteint ses critères de promotion (plan P23, étape 3).

Deux invariants commandent tout le document :

- **un seul écrivain** : une opération a exactement un propriétaire, `ts` ou `py` ; les mutations
  d'un contexte basculent **toutes ensemble** (ADR-2005) ;
- **aucune mesure locale n'est une mesure de staging** : les budgets d'ADR-0041, le canary et la
  restauration chronométrée se mesurent sur le staging fourni par le porteur (ADR-2009). Ce qui est
  prouvé en local est indiqué comme tel.

Fichiers de référence : `docker/compose.coolify.yml` et son inclusion `docker/compose.coolify-py.yml`
(services `api-py`, `worker-py`, `migrate`),
`tools/deploy/cutover.mjs` (production de `OWNERSHIP_OVERRIDES`), `apps/worker-py/src/learny_worker/drain.py`
(contrôle du drain), `docs/operations/coolify.md` § 8 (variables et sondes).

## 0. Prérequis et notations

```bash
export STAGING_APP_URL="https://learny-staging.exemple.fr"      # URL publique du web
export STAGING_API_URL="https://learny-staging.exemple.fr/api"  # via le web, ou le domaine de la façade
export COOLIFY_COMPOSE="docker/compose.coolify.yml"
export STAGING_DATABASE_URL="postgresql://postgres:<mot-de-passe>@<hôte>:5432/postgres"
```

Les commandes `docker compose` de ce runbook s'exécutent **sur l'hôte du staging**, dans le
répertoire `/docker` de la ressource Coolify, avec le fichier `.env` de la ressource
(`--env-file`). Les commandes `node tools/…` s'exécutent **dans le dépôt**, sur cet hôte ou en
local : elles ne touchent qu'aux fichiers versionnés.

## 1. Déployer les deux services Python (étape « build and ship »)

L'image est unique (`docker/api-py.Dockerfile`, SPEC-2003) et la CI la construit à chaque commit
(`.github/workflows/ci.yml`, étape « Construire l'image Python »). Coolify construit la même image :
il n'y a **aucun secret de registre** à configurer.

1. Dans Coolify, la ressource Docker Compose déploie `docker/compose.coolify.yml` : les services
   `api-py` et `worker-py` démarrent aux côtés de `api` (Hono), `web` et `migrate`.
2. Vérifier les sondes et l'image :

   ```bash
   docker compose -f "$COOLIFY_COMPOSE" ps api-py worker-py
   curl -fsS "https://<domaine-de-api-py>/health"
   docker compose -f "$COOLIFY_COMPOSE" exec worker-py \
     python -c "import os,urllib.request; p=os.environ['PY_WORKER_HEALTH_PORT']; \
     print(urllib.request.urlopen(f'http://127.0.0.1:{p}/health/ready').status)"
   ```

   **Critère** : `api-py` sain sur `GET /health`, `worker-py` sain sur `/health/live` **et**
   `/health/ready`.
3. **Budget de connexions** : le pooler Supabase doit accepter au moins
   `répliques api × PY_API_WORKERS × DATABASE_POOL_MAX + répliques worker × DATABASE_POOL_MAX + Hono`.
   Valeurs de départ : `PY_API_WORKERS=2`, `PY_DATABASE_POOL_MAX=5`, un worker →
   `2 × 2 × 5 + 5 + 10 = 35` connexions. Vérifier la limite du pooler avant de monter ces valeurs.
4. **Migrations** : le job `migrate` reste un singleton (`restart: 'no'`, image cible `migrate`,
   enregistrement SHA-256 par fichier dans `public.selfhost_schema_migrations`) ; `api-py` et
   `worker-py` attendent `service_completed_successfully`. Pour les environnements Supabase gérés,
   le job de release est verrouillé :

   ```bash
   flock /tmp/learny-migrate.lock node tools/deploy/migrate.mjs --env staging
   ```

   **Critère** : le job sort en 0, `docker compose ps migrate` affiche `exited (0)`.

## 2. Étape 1 — la façade devant, tout relayé

La façade démarre en **relais pur** : `OWNERSHIP_OVERRIDES={"*":"ts"}`, et le web lui envoie le
trafic.

```bash
# 1. Surcharge de repli total, produite par l'outil (jamais à la main).
export OWNERSHIP_OVERRIDES="$(node tools/deploy/cutover.mjs --all --stage rollback)"
echo "$OWNERSHIP_OVERRIDES"            # {"*":"ts"}
```

1. Dans Coolify, ajouter la variable `OWNERSHIP_OVERRIDES` avec cette valeur sur `api-py`, puis
   `API_INTERNAL_URL=http://api-py:8000` sur `web`. Redéployer `api-py` puis `web` (la surcharge est
   lue au démarrage de la façade, un redémarrage est obligatoire).
2. Vérifier que le trafic traverse la façade et que Hono répond toujours :

   ```bash
   curl -fsS -D - -o /dev/null "$STAGING_APP_URL/api/v1/health"
   curl -fsS -o /dev/null -w '%{http_code}\n' "$STAGING_APP_URL/api/v1/home"
   ```

   **Critère de promotion** (staging 30 min, production 24 h) : taux de 5xx ≤ référence,
   surcoût p95 ≤ 20 ms, aucune nouvelle alerte.
   **Rollback** : remettre `API_INTERNAL_URL=http://api:3001` sur `web`, redéployer `web`.

## 3. Étape 2 — les jobs au worker Python

1. Déployer `worker-py`, puis passer Hono en `LEARNY_API_ROLE=api` et arrêter la synchronisation
   Inngest (`LEARNY_API_ROLE` dans `docker/compose.coolify.yml`, service `api`).
2. Exécuter le drain avant tout basculement de propriété (§ 5) : aucun événement ne doit rester
   sans livraison.
3. Passer les consommateurs et les crons à `py` (déjà le cas dans `api/ownership.yaml`), redémarrer
   `worker-py`.

   **Critère de promotion** : aucune livraison `failed`, plus ancienne livraison en attente
   < 2 min, compteurs de résumés et de rappels égaux à la veille ± 5 %.
   **Rollback** : arrêter `worker-py`, réactiver Inngest, puis drainer et rejouer (§ 4).

## 4. Étape 3 — bascule d'un contexte HTTP (canary en lecture)

Un contexte = la valeur `context` de `api/inventory.json` (`learning`, `tutor`, `billing`,
`assessments`, `formation`, `content`, `engagement`, `identity`, `privacy`, `dev`). L'outil refuse
toute combinaison incohérente : promotion sans canary, mutations des deux côtés, propriétaire
`py@N` que la façade ignorerait.

```bash
# a. Canary en lecture : les GET du contexte passent à py, ses mutations restent à ts.
node tools/deploy/cutover.mjs --context billing --stage reads \
  --current "${OWNERSHIP_OVERRIDES}" --out /tmp/ownership.json
export OWNERSHIP_OVERRIDES="$(cat /tmp/ownership.json)"

# b. Injecter la valeur dans Coolify (variable OWNERSHIP_OVERRIDES de api-py) et redéployer api-py.
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py
```

Mesure du canary (lecture seule, aucune mutation) :

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code} %{time_total}\n' \
    -H "Authorization: Bearer $STAGING_ACCESS_TOKEN" "$STAGING_APP_URL/api/v1/billing/subscription"
done | tee /tmp/canary.txt | awk '{code[$1]++} END {for (c in code) print "HTTP " c ": " code[c]}'
sort -k2 -n /tmp/canary.txt | awk '{t[NR]=$2} END {print "p95 = " t[int(NR*0.95)] " s"}'
```

**Critère de promotion** : 0 réponse 5xx, p95 < 300 ms hors routes IA (BR-PLA-07), aucune alerte de
parité. **Critère d'arrêt** : un seul 5xx ou un p95 hors budget → rollback du contexte (§ 6).
Ensuite seulement, promouvoir les mutations **d'un bloc** :

```bash
node tools/deploy/cutover.mjs --context billing --stage writes \
  --current "${OWNERSHIP_OVERRIDES}" --out /tmp/ownership.json
export OWNERSHIP_OVERRIDES="$(cat /tmp/ownership.json)"
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py
```

Fin de la bascule, quand tous les contextes sont `py` : plus aucune surcharge.

```bash
export OWNERSHIP_OVERRIDES="$(node tools/deploy/cutover.mjs --all --stage writes)"   # {}
```

## 5. Drain du worker (préalable à tout basculement de propriété)

Le répartiteur estampille `dispatched_at` **avant** de créer les livraisons : basculer un
consommateur à `ts` avec des événements en file les perdrait. Le drain est le critère d'arrêt écrit.

```bash
# a. Arrêt de la réclamation : SIGTERM, le worker finit ses lots en cours (45 s au plus).
docker compose -f "$COOLIFY_COMPOSE" stop -t 60 worker-py

# b. Attente de fin de lot et vérification de l'outbox (conteneur jetable, même image, même réseau).
docker compose -f "$COOLIFY_COMPOSE" run --rm --no-deps worker-py \
  python -m learny_worker.drain --wait 60 --require-empty
```

Codes de sortie : `0` = file vide (la bascule ne perd rien) ; `1` = au moins un événement en
attente, en cours, en échec, non réparti (`undispatched`) ou **estampillé sans livraison**
(`orphaned`). Dans ce cas : redémarrer le worker (`up -d worker-py`), laisser la file se vider,
recommencer. Un `orphaned` provient d'un consommateur déjà repassé à `ts` : rejouer ces événements
vers Inngest avant de continuer (étape « jobs rollback » du plan P23).

En local, sans Docker :

```bash
uv run python -m learny_worker.drain --wait 30 --require-empty --json
```

Preuve locale : `apps/worker-py/tests/integration/test_worker_cutover_rollback.py` (4 cas) montre
qu'un événement en attente bloque le drain, qu'un événement réparti sans livraison est signalé
`orphaned`, et qu'après le drain le rejeu ne mute rien deux fois.

## 6. Rollback d'un contexte, puis rollback total

```bash
# Rollback d'un seul contexte : tout son périmètre revient au relais.
node tools/deploy/cutover.mjs --context billing --stage rollback \
  --current "${OWNERSHIP_OVERRIDES}" --out /tmp/ownership.json
export OWNERSHIP_OVERRIDES="$(cat /tmp/ownership.json)"
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py

# Rollback total : la façade ne sert plus rien, Hono reprend tout.
export OWNERSHIP_OVERRIDES="$(node tools/deploy/cutover.mjs --all --stage rollback)"  # {"*":"ts"}
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py
```

Ordre obligatoire pour un rollback complet :

1. **Drain du worker** (§ 5) — aucune livraison en cours, aucun événement sans livraison.
2. **Remise des propriétés à `ts`** : `--all --stage rollback`, redéploiement de `api-py`.
3. **Vérification** : `curl -fsS "$STAGING_APP_URL/api/v1/health"` puis un GET et une mutation
   idempotente (`curl -X POST -H "Idempotency-Key: …" …`), corps et en-têtes inchangés.
4. Si les jobs reviennent à Inngest : réactiver les fonctions et la synchronisation, puis rejouer
   les événements dont la livraison Python n'est pas `done` (identifiants d'origine, Inngest déduplique).
5. Le worker Python peut rester arrêté : la façade relaie tout.

## 7. Arrêt d'urgence (incident en cours)

```bash
# 1. Tout relayé, sans attendre : la façade ne sert plus aucune opération.
export OWNERSHIP_OVERRIDES="$(node tools/deploy/cutover.mjs --all --stage rollback)"
docker compose -f "$COOLIFY_COMPOSE" up -d --no-deps api-py
# 2. Le web repointe Hono (rollback immédiat de l'étape 1).
#    Coolify : API_INTERNAL_URL=http://api:3001 sur web, puis redéployer web.
curl -fsS -o /dev/null -w '%{http_code}\n' "$STAGING_APP_URL/api/v1/health"
# 3. Le worker Python ne réclame plus rien.
docker compose -f "$COOLIFY_COMPOSE" stop -t 60 worker-py
```

Aucun secret n'est imprimé : les variables restent dans Coolify.

## 8. Restauration d'une sauvegarde (staging)

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
curl -fsS http://127.0.0.1:8099/api/v1/health
curl -fsS http://127.0.0.1:8099/health
kill %1
```

**Critère** : les comptes des tables de référence sont égaux, les empreintes aussi, `/api/v1/health`
répond 200 et la sonde de la façade répond `ok`. Consigner la durée des deux commandes `time`.

## 9. Liste de contrôle d'incident

1. Constater : 5xx, p95, plus ancienne livraison en attente, livraisons `failed`.
2. Décider : rollback d'un contexte (§ 6) ou arrêt d'urgence (§ 7).
3. Drainer avant toute remise de propriété (§ 5).
4. Vérifier la façade (`/health`, `/api/v1/health`) et une lecture par runtime.
5. Consigner l'heure, la surcharge appliquée et les mesures brutes dans `evidence/SPEC-2301/`.

## 10. Ce qui est prouvé en local, ce qui exige le staging

| Preuve | Environnement | Statut |
|---|---|---|
| Canary et promotion d'un contexte, refus des combinaisons incohérentes | local (outil, inventaire réel) | prouvé (Vitest + pytest) |
| Drain du worker et remise des propriétés | local (PostgreSQL local, worker) | prouvé (4 cas d'intégration) |
| Rejeu sans perte d'événement et sans double mutation | local (outbox + `job_deliveries`) | prouvé |
| Client Bearer externe sans cookie | local (façade + Supabase local) | prouvé (e2e) |
| Sondes et services Coolify, budgets de charge, rollback chronométré, restauration chronométrée | staging fourni par le porteur | **bloqué externe** (ADR-2009) |

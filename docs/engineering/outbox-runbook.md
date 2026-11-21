# Runbook — outbox et worker Python (SPEC-2102)

Exploitation de l'exécution asynchrone durable qui remplace Inngest (ADR-2006, ADR-2014). Le worker
Python (`apps/worker-py`) répartit l'outbox transactionnelle (`public.event_outbox`) vers une
livraison par consommateur (`public.job_deliveries`), réclame chaque livraison sous bail, appelle le
cas d'usage directement (aucun appel HTTP interne, ET-3) puis la clôt.

## 1. Ce qui appartient à qui

`api/ownership.yaml` est la seule source de vérité : le worker n'exécute que les consommateurs
déclarés `py` et n'émet un tick périodique que si son cron est `py`.

| Entrée | Propriétaire | Conséquence |
|---|---|---|
| `consumers.devtools.demo_job` | `py` | le worker répartit et exécute la démonstration |
| tous les autres consommateurs | `ts` | jamais exécutés par Python (CA-3) |
| `crons.cron/hourly-tick`, `crons.cron/nightly` | `ts` | le planificateur Python reste en veille (ADR-2020) |

Une entrée `ts` n'est jamais exécutée par Python, même si un consommateur du même nom existe dans
`learny_worker/consumers.py` : le registre décrit la cible, `ownership.yaml` décide.

## 2. Boucles et réglages

Un processus `python -m learny_worker` porte quatre boucles : répartiteur, exécuteur, planificateur
singleton et serveur de santé optionnel.

| Réglage | Défaut | Rôle |
|---|---|---|
| `JOBS_MODE` | `worker` | `inline` exécute les consommateurs dans l'API (interdit en production) |
| `PY_DISPATCH_INTERVAL_MS` | `500` | période du répartiteur |
| `PY_DISPATCH_BATCH_SIZE` | `100` | événements estampillés par lot |
| `PY_WORKER_CONCURRENCY` | `8` | livraisons en vol par processus |
| `PY_WORKER_POLL_INTERVAL_MS` | `500` | période de réclamation |
| `PY_WORKER_HEALTH_PORT` | `0` | `0` désactive le serveur de santé (`/health/live`, `/health/ready`) |
| `PY_SCHEDULER_RETRY_INTERVAL_S` | `15` | réessai d'acquisition du verrou de leader |
| `PY_SCHEDULER_POLL_INTERVAL_S` | `20` | période d'évaluation des ticks |

Arrêt : `SIGTERM` ou `SIGINT` arrêtent immédiatement toute nouvelle réclamation et laissent le lot en
cours se terminer (au plus 45 s). Une livraison abandonnée n'est pas perdue : son bail expire et
elle est reprise (ET-1, CL-1).

## 3. Modèle de données

`public.event_outbox` — une ligne par événement émis, dans la transaction du cas d'usage.

| Colonne | Sens |
|---|---|
| `event_id` | identifiant métier, unique ; c'est la clé de déduplication |
| `name` | nom d'événement (`<contexte>/<fait>`) |
| `data` | charge utile JSON |
| `sent_at` | estampille du répartiteur TypeScript (Inngest) |
| `dispatched_at` | estampille du répartiteur Python ; `null` = pas encore réparti |

`public.job_deliveries` — une ligne par couple (événement, consommateur), clé primaire
`(event_id, consumer)`, RLS forcée sans politique (rôle de service uniquement).

| Colonne | Sens |
|---|---|
| `status` | `pending` → `running` → `done` ou `failed` |
| `attempts` | nombre de tentatives, incrémenté à chaque réclamation |
| `run_after` | instant au plus tôt de la prochaine tentative (délai du backoff inclus) |
| `locked_until` | fin du bail ; `running` avec un bail expiré = worker mort |
| `last_error` | 300 derniers caractères de la dernière erreur |
| `completed_at` | instant de clôture (`done` ou `failed`) |

L'historique n'est jamais rejoué : la migration `0055_jobs_rules.sql` a estampillé
`dispatched_at = coalesce(sent_at, created_at)` sur les lignes existantes.

## 4. Diagnostic

Toutes les requêtes passent par la base locale de développement :

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
flock /tmp/learny-sdd-db.lock psql "$DATABASE_URL" -c "…"
```

### 4.1 État général

```sql
select status, count(*), min(run_after) as oldest_due, max(completed_at) as last_done
from public.job_deliveries
group by status
order by status;
```

La ligne `worker.stats` du leader (toutes les 60 s) donne les trois mêmes indicateurs sans requête
additionnelle : `oldestPendingSeconds`, `running`, `failedLastHour` (ET-2).

### 4.2 Livraisons bloquées

```sql
-- running dont le bail a expiré : worker tué ; elles seront reprises automatiquement
select event_id, consumer, attempts, locked_until, now() - locked_until as overdue
from public.job_deliveries
where status = 'running' and locked_until < now();

-- pending en retard : backoff en cours, ou aucun worker ne réclame
select event_id, consumer, attempts, run_after, now() - run_after as late
from public.job_deliveries
where status = 'pending' and run_after <= now()
order by run_after
limit 50;
```

Un `pending` en retard alors qu'aucune livraison ne passe à `running` signifie que le worker ne
tourne pas, que `JOBS_MODE` n'est pas `worker`, ou que `PY_WORKER_CONCURRENCY` est saturé par des
baux non expirés. Vérifier `/health/live` puis `/health/ready` (ce dernier interroge la base).

### 4.3 Événements jamais répartis

```sql
select count(*) filter (where dispatched_at is null) as undispatched,
       count(*) filter (where dispatched_at is null and sent_at is not null) as also_sent_by_ts
from public.event_outbox;
```

`undispatched > 0` avec un `devtools.demo_job` attendu : le répartiteur est arrêté ou en échec de
base. Un échec de répartition est journalisé (`outbox dispatch failed`) et la boucle survit : le lot
suivant réessaie, aucune ligne n'est perdue car l'estampille et la création des livraisons sont dans
la même transaction.

### 4.4 Lettres mortes

Une livraison `failed` est une lettre morte : elle ne sera plus réclamée.

```sql
select event_id, consumer, attempts, last_error, completed_at
from public.job_deliveries
where status = 'failed'
order by completed_at desc
limit 50;
```

Trois causes, à distinguer par `last_error` et `attempts` :

| Cause | Signature | Traitement |
|---|---|---|
| charge utile invalide | `attempts = 0`, `last_error` de validation (`VALIDATION_FAILED`) | jamais réessayée : corriger le producteur, puis émettre un nouvel événement |
| erreur permanente du consommateur | `last_error` explicite (`PermanentJobError`) | corriger le consommateur, puis rejouer (§5) |
| épuisement des tentatives | `attempts = max_attempts` après backoff | après correction, rejouer (§5) |

Backoff appliqué entre deux tentatives : `min(10 s · 2^(n-1), 1 h)` — 10 s, 20 s, 40 s, 80 s… au plus
1 h. `max_attempts` vaut 4 par défaut (première tentative incluse) et le bail vaut
`timeout_s + 30 s`.

## 5. Rejeu

### 5.1 Rejouer une livraison

Après correction du consommateur, remettre la livraison en attente immédiatement :

```sql
update public.job_deliveries
set status = 'pending', attempts = 0, last_error = null, completed_at = null,
    locked_until = null, run_after = now()
where event_id = '<event_id>' and consumer = '<consumer>';
```

Le worker la réclame au prochain tour (≤ 500 ms). Le rejeu est sûr : les consommateurs sont écrits
pour être idempotents (clés uniques, gardes de transition, `on conflict do nothing`), une livraison
pouvant s'exécuter plus d'une fois après un crash.

`attempts = 0` redonne le budget complet de tentatives ; pour ne pas le redonner, retirer cette
colonne de l'`update`.

### 5.2 Rejouer tous les événements d'un consommateur

```sql
update public.job_deliveries
set status = 'pending', attempts = 0, last_error = null, completed_at = null,
    locked_until = null, run_after = now()
where consumer = 'devtools.demo_job' and status = 'failed';
```

### 5.3 Répartir de nouveau un événement

Un événement déjà réparti (`dispatched_at` non nul) ne crée plus de livraison. Pour le répartir une
seconde fois — par exemple après avoir ajouté un consommateur Python — retirer l'estampille ; la
création des livraisons est protégée par la clé primaire, donc aucun doublon :

```sql
update public.event_outbox set dispatched_at = null where event_id = '<event_id>';
```

Ne jamais remettre `dispatched_at` à `null` en masse sur l'historique : cela rejouerait tous les
effets des consommateurs Python.

### 5.4 Après une bascule de propriétaire

Quand une entrée d'`api/ownership.yaml` passe de `ts` à `py`, les événements déjà répartis par le
TypeScript (`sent_at` non nul, `dispatched_at` non nul) ne créent pas de livraison Python. Si le
consommateur doit rattraper l'historique, passer par §5.3 événement par événement, jamais en masse.

## 6. Incident : le worker ne progresse plus

1. `/health/live` répond mais `/health/ready` échoue → base injoignable ; aucun consommateur ne peut
   aboutir. Rétablir `DATABASE_URL` ou la base, puis redémarrer.
2. `/health/live` ne répond pas → processus mort ; le redémarrer. Les baux expirés sont repris au
   démarrage, sans intervention.
3. Les deux répondent, `pending` en retard s'accumule, `running` est nul → vérifier que les
   consommateurs sont bien `py` dans `api/ownership.yaml` et que `JOBS_MODE=worker`.
4. `running` reste bloqué avec `locked_until` dans le futur → un consommateur dépasse son timeout ;
   le bail expirera, la tentative sera réessayée avec backoff. Chercher `job timed out` dans les
   journaux, puis corriger le consommateur.
5. `failedLastHour` augmente → traiter les lettres mortes (§4.4).

## 7. Planificateur singleton

Une seule instance détient `pg_try_advisory_lock(21020001)` ; les autres restent en veille et
réessaient toutes les 15 s (CL-3). Les crons restant `ts` (ADR-2020), le planificateur est inactif :
aucun tick n'est émis.

```sql
-- qui détient le verrou du planificateur ?
select pid, granted, classid, objid
from pg_locks
where locktype = 'advisory' and objid = 21020001;
```

Plusieurs lignes avec `granted = true` sur un même `objid` sont impossibles : la présence d'un seul
détenteur est la preuve du singleton. Un verrou détenu par un `pid` disparu est libéré par
PostgreSQL à la fermeture de la session.

## 8. Vérifications avant de conclure un incident

```bash
flock /tmp/learny-sdd-db.lock uv run pytest apps/worker-py/tests/integration -q
```

Ces tests couvrent les cas d'incident : crash et reprise après expiration du bail, deux exécuteurs
concurrents sans partage de livraison, livraison dupliquée à effet unique, charge utile invalide
jamais exécutée, arrêt gracieux, leader unique, refus d'insertion cliente sur les deux tables.

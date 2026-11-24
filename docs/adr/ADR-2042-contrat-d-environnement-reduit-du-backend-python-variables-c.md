# ADR-2042 — Contrat d'environnement réduit du backend Python : variables conservées, dérivées et constantes

- **Statut** : Acceptée — amendée par ADR-4007
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-009, ADR-0227, ADR-0336, ADR-2005, ADR-2006, ADR-2011, ADR-2040, SPEC-2302, ADR-4007

> Amendée par ADR-4007 (2026-11-24) : le contrat déployé se réduit encore. `API_PROXY_SECRET`, `EMAIL_LINK_SECRET`, `VAPID_PRIVATE_KEY` et `RATE_LIMIT_IP_SECRET` dérivent d'`APP_ENCRYPTION_KEY`, l'identité légale et les versions des documents sont des constantes de `packages/config/src/product.ts`, et `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` ne sont plus fournies par les piles (le web les lit encore si on les lui donne). Les dérivations, les constantes et les suppressions décidées ici restent valides pour le backend Python.

## Contexte

Le porteur du projet demande de ramener les variables d'environnement à dix au plus : les autres sont supprimées ou deviennent des constantes du code, sans jamais coder un secret en dur. Inventaire du 2026-11-23 (branche main) : le schéma TypeScript (packages/config) documente 58 variables serveur, 6 publiques et 13 d'outillage ; le backend Python en lit 60 (53 champs de Settings plus APP_ENCRYPTION_KEY(_PREVIOUS), ALLOW_LOCAL_MODELS, CLOCK_FIXED_AT, LLM_FIXTURES_DIR, TUTOR_PROMPTS_DIR et PY_API_DIR lues directement), et docker/compose.coolify-py.yml en fait saisir 36 dans Coolify. Beaucoup ne varient jamais d'un environnement à l'autre (réglages PY_* du worker, taille du pool, port SMTP, audience JWT, versions des CGU), sont redondantes (SUPABASE_URL et NEXT_PUBLIC_SUPABASE_URL pour la même valeur, VAPID_PUBLIC_KEY recalculable depuis la clé privée, modes LLM/STRIPE/EMAIL/PUSH/JOBS/RATE_LIMIT qui suivent APP_ENV dans toutes les piles réelles) ou mortes (SENTRY_DSN, COMMIT et VERSION jamais lus par Python, TRUST_PROXY sans effet dès qu'API_PROXY_SECRET est fixé, chemins de fixtures jamais renseignés). Le backend TypeScript (apps/api, Inngest) est encore déployé en coexistence et son retrait, avec ses variables, est l'objet de SPEC-2302 (EF-2) en cours sur une autre branche ; une autre branche retire les démonstrations /_dev. Le décompte ne vise donc que le contrat d'exécution de l'application cible (web, API et worker Python) ; les variables standard (TZ, CI, PORT, NODE_ENV, NEXT_RUNTIME), l'outillage de test et de CI, et l'infrastructure de la pile Compose (POSTGRES_PASSWORD, ports publiés, SMTP de GoTrue) restent hors décompte, comme le prévoit déjà ADR-0227.

## Décision

1) learny.shared.config.ENVIRONMENT_VARIABLES est la seule liste de variables lues par l'API et le worker Python (source pydantic filtrée) ; toute nouvelle variable exige d'amender cet ADR. Contrat permanent (18) : APP_ENV, NEXT_PUBLIC_APP_URL, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, APP_ENCRYPTION_KEY, API_PROXY_SECRET, EMAIL_LINK_SECRET, EMAIL_FROM, RESEND_API_KEY, VAPID_PRIVATE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, VOYAGE_API_KEY, SEARCH_API_KEY. Facultatives : APP_ENCRYPTION_KEY_PREVIOUS et API_PROXY_SECRET_PREVIOUS (rotation), SMTP_HOST (piles simulées), ALLOW_LOCAL_MODELS (SPEC-505), ENABLE_SDD_PAGES et CLOCK_FIXED_AT (test et QA, refusées en production), GIT_COMMIT et APP_VERSION (métadonnées de build), PY_HONO_UPSTREAM_URL et OWNERSHIP_OVERRIDES (coexistence, retirées avec le relais par SPEC-2302) ; standard : CI, PORT. 2) Les Supabase prennent les noms publics du web (SUPABASE_URL et SUPABASE_ANON_KEY disparaissent). 3) Dérivations : LLM_MODE et PUSH_MODE = mock en local/test, live ailleurs ; EMAIL_MODE = memory en test, smtp en local ou si SMTP_HOST est fixé, resend sinon ; STRIPE_MODE suit la clé secrète (aucune : mock, sk_live_/rk_live_ : live, autre : test) ; JOBS_MODE = inline seulement en test à horloge figée (pile e2e), worker sinon (le worker ne consulte plus ce mode) ; RATE_LIMIT_MODE = off quand l'horloge est figée hors production (ADR-0336), on sinon ; CLOCK_FIXED_AT=real vaut horloge réelle comme en TypeScript ; RATE_LIMIT_IP_SECRET = HMAC-SHA256(APP_ENCRYPTION_KEY, learny/rate-limit-ip/v1) ; VAPID_PUBLIC_KEY = point P-256 de VAPID_PRIVATE_KEY ; VAPID_SUBJECT = mailto: de l'adresse d'EMAIL_FROM ; issuer et JWKS dérivés de NEXT_PUBLIC_SUPABASE_URL. 4) Constantes : pool PostgreSQL 5, port SMTP 1025, audience JWT authenticated, versions CGU et confidentialité 2026-11-11, TRUST_PROXY désactivé (le secret du relais authentifie le proxy), ALLOWED_ORIGINS vide, réglages du worker (500 ms, lot de 100, 8 livraisons, 15 s et 20 s), 2 processus uvicorn ; la santé du worker écoute le PORT standard. 5) Supprimées côté Python : SENTRY_DSN, COMMIT, VERSION, SUPABASE_JWKS_URL, JWT_ISSUER_OVERRIDE, SUPABASE_JWT_AUDIENCE, LLM_FIXTURES_DIR, TUTOR_PROMPTS_DIR, PY_API_DIR (l'image trouve /app/api depuis son répertoire de travail), PY_API_WORKERS, PY_DATABASE_POOL_MAX, PY_WORKER_HEALTH_PORT. 6) Garde de production (ADR-2040) : EMAIL_FROM devient obligatoire, RATE_LIMIT_IP_SECRET et VAPID_SUBJECT ne le sont plus, CLOCK_FIXED_AT est refusée. 7) Le TypeScript garde son schéma jusqu'à SPEC-2302 : .env.example marque [TS] les variables qu'il est seul à lire. Bilan : le backend Python passe de 60 variables lues à 18 permanentes plus 10 facultatives (et 2 standard) ; la saisie Coolify du compose Python passe de 36 à 21 noms. L'objectif de 10 n'est pas atteint sans coder ou fusionner des secrets : les 18 permanentes sont 13 secrets ou identifiants de fournisseurs distincts (base, Supabase service et JWT, clé maîtresse, relais, liens e-mail, Resend, VAPID, Stripe ×3, Voyage, Tavily) et 5 valeurs propres à chaque déploiement (APP_ENV, deux URL, clé anon, expéditeur). Atteindre 10 demande une décision du porteur (voir Conséquences).

## Conséquences

Comportement produit inchangé dans toutes les piles réelles (e2e, QA, production) : les valeurs dérivées sont celles que les compose et la configuration Playwright fixaient. Changements d'exploitation : la clé du limiteur Python change une fois (les seaux repartent de zéro) ; la pile QA ne peut plus forcer un mode par variable (APP_ENV=preview, la clé Stripe, CLOCK_FIXED_AT=real et SMTP_HOST suffisent, docs/operations/coolify-qa.md) ; la production Python envoie par Resend sauf si SMTP_HOST est fixé. Le compose Python de production fournissait NEXT_PUBLIC_VAPID_PUBLIC_KEY alors que Python lisait VAPID_PUBLIC_KEY : la dérivation corrige ce démarrage live impossible. Tests mis à jour en cohérence (tests de garde de production, test Coolify sur le port de santé, environnements Python de Playwright) et nouveau test du contrat. Pistes pour descendre à 10, à arbitrer par le porteur : dériver EMAIL_LINK_SECRET et API_PROXY_SECRET de la clé maîtresse (invalide les liens de désinscription déjà envoyés et impose le même changement au web et à Hono), regrouper les trois valeurs Stripe ou les clés de fournisseurs dans une variable structurée, retirer la recherche Tavily (SEARCH_API_KEY) ; aucune n'est appliquée ici. SPEC-2302 retire les variables du backend TypeScript et d'Inngest, PY_HONO_UPSTREAM_URL et OWNERSHIP_OVERRIDES.

## Tableau avant/après (backend Python)

| Variable lue avant | Après | Valeur ou source |
|---|---|---|
| `APP_ENV` | conservée | `local`, `test`, `preview`, `production` |
| `NEXT_PUBLIC_APP_URL` | conservée | URL publique |
| `DATABASE_URL` | conservée (secret) | — |
| `SUPABASE_URL` | renommée | `NEXT_PUBLIC_SUPABASE_URL` (nom du web) |
| `SUPABASE_ANON_KEY` | renommée | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nom du web) |
| `SUPABASE_SERVICE_ROLE_KEY` | conservée (secret) | — |
| `SUPABASE_JWT_SECRET` | conservée (secret) | — |
| `APP_ENCRYPTION_KEY` | conservée (secret) | — |
| `API_PROXY_SECRET` | conservée (secret) | — |
| `EMAIL_LINK_SECRET` | conservée (secret) | — |
| `EMAIL_FROM` | conservée | expéditeur vérifié du déploiement |
| `RESEND_API_KEY` | conservée (secret) | — |
| `VAPID_PRIVATE_KEY` | conservée (secret) | — |
| `STRIPE_SECRET_KEY` | conservée (secret) | — |
| `STRIPE_WEBHOOK_SECRET` | conservée (secret) | — |
| `STRIPE_PRICE_ID` | conservée | identifiant du tarif |
| `VOYAGE_API_KEY` | conservée (secret) | — |
| `SEARCH_API_KEY` | conservée (secret, facultative) | — |
| `APP_ENCRYPTION_KEY_PREVIOUS` | facultative (rotation) | — |
| `API_PROXY_SECRET_PREVIOUS` | facultative (rotation) | — |
| `SMTP_HOST` | facultative | Mailpit des piles simulées |
| `ALLOW_LOCAL_MODELS` | facultative | `true` pour les modèles locaux (SPEC-505) |
| `ENABLE_SDD_PAGES` | facultative (test, QA) | refusée en production |
| `CLOCK_FIXED_AT` | facultative (test, QA) | refusée en production ; `real` = horloge réelle |
| `GIT_COMMIT`, `APP_VERSION` | facultatives (build) | renseignées par le déploiement |
| `PY_HONO_UPSTREAM_URL`, `OWNERSHIP_OVERRIDES` | facultatives (coexistence) | retirées par SPEC-2302 |
| `CI` | standard | — |
| `PY_WORKER_HEALTH_PORT` | remplacée | `PORT` standard (`8081` dans Coolify) |
| `LLM_MODE` | dérivée | `mock` en local/test, `live` sinon |
| `PUSH_MODE` | dérivée | `mock` en local/test, `live` sinon |
| `EMAIL_MODE` | dérivée | `memory` en test, `smtp` en local ou avec `SMTP_HOST`, `resend` sinon |
| `STRIPE_MODE` | dérivée | clé absente : `mock` ; `sk_live_`/`rk_live_` : `live` ; autre : `test` |
| `JOBS_MODE` | dérivée | `inline` en test à horloge figée, `worker` sinon |
| `RATE_LIMIT_MODE` | dérivée | `off` à horloge figée hors production, `on` sinon |
| `RATE_LIMIT_IP_SECRET` | dérivée | HMAC-SHA256 d'`APP_ENCRYPTION_KEY` |
| `VAPID_PUBLIC_KEY` | dérivée | point P-256 de `VAPID_PRIVATE_KEY` |
| `VAPID_SUBJECT` | dérivée | `mailto:` + adresse d'`EMAIL_FROM` |
| `SUPABASE_JWKS_URL`, `JWT_ISSUER_OVERRIDE` | dérivées | `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1[/.well-known/jwks.json]` |
| `DATABASE_POOL_MAX`, `PY_DATABASE_POOL_MAX` | constante | `5` |
| `PY_API_WORKERS` | constante | `2` (commande du compose) |
| `PY_WORKER_CONCURRENCY` | constante | `8` |
| `PY_DISPATCH_INTERVAL_MS`, `PY_DISPATCH_BATCH_SIZE` | constantes | `500`, `100` |
| `PY_WORKER_POLL_INTERVAL_MS` | constante | `500` |
| `PY_SCHEDULER_RETRY_INTERVAL_S`, `PY_SCHEDULER_POLL_INTERVAL_S` | constantes | `15`, `20` |
| `SMTP_PORT` | constante | `1025` |
| `SUPABASE_JWT_AUDIENCE` | constante | `authenticated` |
| `LEGAL_CGU_VERSION`, `LEGAL_PRIVACY_VERSION` | constantes | `2026-11-11` |
| `TRUST_PROXY` | constante | désactivé (le secret du relais authentifie le proxy) |
| `ALLOWED_ORIGINS` | constante | aucune origine supplémentaire |
| `SENTRY_DSN`, `COMMIT`, `VERSION` | supprimées | jamais lues par Python |
| `LLM_FIXTURES_DIR`, `TUTOR_PROMPTS_DIR` | supprimées | jamais renseignées |
| `PY_API_DIR` | supprimée | `/app/api` trouvé depuis le répertoire de travail de l'image |

Décompte : 60 variables lues avant ; 18 permanentes + 10 facultatives (+ `CI`, `PORT` standard)
après. Saisie Coolify du compose Python : 36 noms avant, 21 après (QA : 43 avant, 25 après).

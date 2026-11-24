# Architecture — vue d'ensemble

Complète `docs/legacy/specification-v0/3-Architecture-technique.md` (raisonnement d'origine). Les choix sont actés dans `docs/adr/`. Ce document est normatif pour la structure du dépôt et la circulation des données.

## 0. Applications et frontières (ADR-1001, ADR-2043)

```
Navigateur (PWA)                          Android / iOS (Expo, piste mobile ADR-3001)
   │ HTTPS, même origine                       │ HTTPS, Authorization: Bearer
   ▼                                           │
apps/web  (Next.js, client pur, ADR-1003)      │
   ├─ écrans React, rendu serveur              │
   ├─ proxy.ts : session, gardes, relai /api ──┼──► en-têtes de proxy de confiance (ADR-1005)
   └─ Server Components → @learny/api-client ──┤
                                               ▼
        apps/api  (façade FastAPI, ADR-2003, ADR-2012) — sert tout le contrat
           ├─ pipeline générique : identifiant de requête, origine, limite, idempotence,
           │  authentification, validation Pydantic, CGU, handler, validation de sortie
           ├─ 156 opérations d'api/openapi.yaml + 11 routes spéciales (santé, callback, dev)
           └─ ► PostgreSQL (Supabase, RLS), outbox, fournisseurs IA, Resend, Web Push, Stripe
        apps/worker  (outbox PostgreSQL, ADR-2006, ADR-2014)
           ├─ 23 consommateurs d'événements (learny_worker/consumers.py)
           └─ 2 crons : cron/hourly-tick (:05) et cron/nightly (01:30 UTC) (scheduler.py)
```

Le backend TypeScript (Hono, Inngest, paquets serveur) et la façade de relais ont été retirés par
SPEC-2302 : il n'y a plus de table de propriété `api/ownership.yaml` ni de contexte `ts`/`py`.

| Couche | Emplacement | Importable par |
|---|---|---|
| Contrat (TypeScript) | `packages/contracts` — registre Zod, export `api/openapi.yaml`, catalogue d'erreurs et d'événements | génération Python, SDK, web, outils |
| Clients web | `packages/api-client`, `api-sdk`, `ui`, `bricks`, `i18n`, `config`, `core` (entrée `.`), `domain` | `apps/web`, piste mobile, tests |
| Schéma de données | `packages/db` — schéma Drizzle, migrations SQL, matrice RLS (aucun accès à l'exécution) | migrations, `db:check`, `rls:check` |
| Domaines Python | `python/learny/src/learny/<contexte>` — `domain`, `application`, `infrastructure`, `public` | autres contextes via `public` uniquement |
| Façade et worker | `apps/api/src/learny_api`, `apps/worker/src/learny_worker` | rien : ce sont des applications |

Règles vérifiées : `pnpm lint` (`learny/web-is-a-client`, `tools/migration/report.mjs --check`)
garantit que `apps/web` n'importe que des paquets présents du workspace ; import-linter interdit aux
domaines partagés d'importer `learny_api`/`learny_worker` et aux domaines `billing`/`privacy` de
dépendre de leur propre infrastructure (`pyproject.toml`).

## 1. Principes

1. **Le modèle propose, le code valide et exécute** (ADR-0021). Toute écriture (apprenant ou tuteur) passe par un cas d'usage qui valide (Pydantic pour la frontière HTTP) puis persiste.
2. **Déterministe d'abord** (ADR-0020) : `learny.learning` porte le moteur (FSRS, maîtrise, lacunes, tirages, planificateur) en Python pur, sans I/O ni IA, testé unitairement et par propriétés.
3. **Contrats partagés** : le registre Zod de `packages/contracts` reste la source unique ; `api/openapi.yaml` en est l'export, et la table de routes Python, les modèles Pydantic et le SDK en sont **générés** (ADR-2012).
4. **Isolation des données au niveau base** : Row Level Security sur toutes les tables (ADR-0022), revendications locales à la transaction et `set local role authenticated` (ADR-2010).
5. **Tout appel IA passe par `learny.platform.llm`** (résolution du modèle choisi par l'utilisateur, journal `ai_calls`, mode `mock` en test) ; aucun autre module n'importe un SDK de fournisseur.
6. **Horloge injectable** partout (ADR-0047) : `deps.clock.now()` côté Python, `packages/core/clock` côté TypeScript ; aucun `datetime.now()` hors de `learny.shared.clock` (règle ruff) ni `Date.now()` hors de l'horloge injectable.

## 2. Topologie

```
Navigateur (PWA) / clients natifs
   │  HTTPS
   ▼
apps/web  (Next.js App Router, Vercel région UE fra1)
   ├─ composants et Server Components : affichage et chargement via @learny/api-client
   └─ proxy.ts : relai de même origine de /api/* et /openapi.json
   │
   │  Requêtes relayées avec les en-têtes ADR-1005 ; aucune route Next n'héberge l'API.
   └──► apps/api (FastAPI + Uvicorn, Docker sur Coolify, ADR-2007)
         ├─ /api/v1/* et flux SSE du tuteur
         └─ routes spéciales : /api/v1/health, callback d'e-mail, routes de développement
   │
   ├──► apps/worker (python -m learny_worker, même image, autre commande)
   │      ├─ outbox → job_deliveries → consommateurs (baux FOR UPDATE SKIP LOCKED)
   │      └─ ordonnanceur unique (verrou consultatif PostgreSQL) : ticks horaire et nocturne
   │
   ├──► Supabase (UE) : Postgres 15+ (pgvector, unaccent, pg_trgm), Auth, Storage
   ├──► Fournisseurs IA via learny.platform.llm (Anthropic par défaut ; BYOK)
   ├──► Voyage AI (embeddings), API de recherche web (repli)
   ├──► Resend (e-mail), Web Push (VAPID), Stripe (abonnement), Sentry (erreurs)
```

## 3. Organisation du dépôt

```
/
├── AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
├── apps/
│   ├── web/                    Next.js : app/, components/ (spécifiques), lib/, proxy.ts, e2e/ (Playwright)
│   ├── api/                    façade FastAPI : pipeline, handlers par contexte, routes spéciales, tests
│   └── worker-py/              worker Python : consommateurs, ordonnanceur, santé, tests
├── packages/
│   ├── config/                 constantes produit, identifiants de modèles, réglages du web
│   ├── core/                   horloge, fuseaux, erreurs typées, logger, utilitaires (Result, ids)
│   ├── contracts/              schémas Zod des entrées/sorties API, événements, DTO ; export OpenAPI
│   ├── api-client/             client HTTP typé partagé entre clients web et natifs
│   ├── api-sdk/                types générés depuis api/openapi.yaml (openapi-typescript)
│   ├── domain/                 logique pure partagée, sans I/O serveur
│   ├── i18n/                   messages partagés
│   ├── db/                     schéma Drizzle, migrations SQL, politiques RLS, seed (pas de client à l'exécution)
│   ├── ui/                     design system : jetons, composants React, icônes, utilitaires d'accessibilité
│   ├── bricks/                 types de briques : schéma, correction, vue, registre
│   └── testing/                fabriques de données, helpers Vitest/Playwright, collecte de preuves, horloge figée
├── python/
│   └── learny/                 bibliothèque Python : 9 contextes métier + platform + shared (+ views)
│       └── src/learny/{identity,formation,learning,assessments,content,tutor,engagement,billing,privacy}
├── design/maquettes/           maquettes de référence (ne pas modifier)
├── design/references/          captures de référence générées (SPEC-005)
├── docs/                       produit, architecture, ingénierie, ADR, legacy
├── specs/                      catalogue, gabarit, spécifications par phase, checkpoints
├── tools/sdd/                  outillage du référentiel (suivi, boucle, validation, audit)
├── tools/migration/            inventaire final et frontière du web
├── tools/contract/             génération des artefacts Python et du SDK
├── tools/parity/               oracle de parité contre l'API Python
├── progress/                   état (state.json), tableau de bord (PROGRESS.md), anomalies
├── evidence/                   preuves par spécification et par checkpoint
├── supabase/                   config CLI Supabase (config.toml), migrations générées, seed.sql
├── docker/                     Dockerfiles et compose (dev, auto-hébergé, Coolify)
└── .github/                    CI, modèles de PR
```

Règles de dépendance :
- un contexte Python n'expose que son `public.py` ; `domain` et `application` n'importent ni `slowapi`-like,
  ni `learny_api`, ni `learny_worker` (import-linter) ;
- `learny.shared` et `learny.platform` n'importent jamais `learny_api`/`learny_worker` ;
- le web n'importe que les paquets clients et `ui`/`bricks` ; aucun paquet n'importe `apps/*` ;
- `packages/contracts` ne dépend d'aucune application : c'est un artefact de description.

## 4. Flux types

**Lecture d'un écran** : Server Component ou chargeur de `apps/web/lib` →
`serverApi()` (`@learny/api-client`) → relai HTTP interne de `proxy.ts` → façade Python →
pipeline (authentification, adaptateur mince) → cas d'usage du contexte → SQL explicite avec
revendications locales (RLS) → modèle Pydantic de sortie → composants `ui`.

**Mutation** : composant client → client typé `@learny/api-client` → relai `proxy.ts` sur la même
origine → façade Python → pipeline (authentification, validation, idempotence, limite) → cas
d'usage → transaction (écriture + `emit` dans `event_outbox`) → réponse validée par le modèle de
sortie.

**Traitement long** : `event_outbox` (transactionnel) → `job_deliveries` → consommateur du worker
(bail, reprises, `run_at` pour les échéances) → cas d'usage du contexte → notifications.

**Appel IA** : handler → `learny.tutor` → `learny.platform.llm` (modèle choisi par l'utilisateur,
sinon `AI_UNAVAILABLE`) → appel (outils stricts) → validation de chaque appel d'outil → exécution
par le registre → journal `ai_calls`.

## 5. Catalogue des événements de domaine (`packages/contracts/src/events.ts`)

| Événement | Émis par | Consommateurs |
|---|---|---|
| `user/signed-up` | SPEC-202 | profil par défaut, e-mail de bienvenue |
| `user/onboarding-completed` | SPEC-602 | planification initiale, automatismes par défaut |
| `formation/cadrage-completed` | SPEC-604 | génération du programme |
| `formation/programme-requested` | SPEC-605 | job de conception (recherche web) |
| `formation/programme-imported` | SPEC-605 | job de structuration |
| `formation/programme-validated` | SPEC-605 | planification (SPEC-407), banques initiales, notifications |
| `formation/paused` / `formation/resumed` | SPEC-618 | planificateur |
| `formation/completed` | SPEC-612 | bilan final (SPEC-617), jalons |
| `formation/maintenance-changed` | SPEC-617 | notifications et planification de l'entretien de mémoire |
| `resource/uploaded` | SPEC-206 (finalisation d'un fichier), SPEC-607 (notes et liens) | ingestion (SPEC-509/510) |
| `resource/ready` / `resource/failed` | SPEC-509 | UI temps réel, notifications |
| `chapter/contributions-completed` | SPEC-607 | génération du cours (SPEC-608) |
| `course/generated` | SPEC-608 | banques de questions, notification « cours prêt » |
| `course/progress-updated` / `course/summary-submitted` / `course/section-edited` / `course/section-reported` | SPEC-609 | suivi de lecture, historique des corrections et signalements |
| `quiz/submitted` | SPEC-611 | correction des questions ouvertes, moteur, lacunes |
| `quiz/graded` | SPEC-611 | résultat, déblocage, automatisme 4 |
| `module/validated` | SPEC-612 | déblocage, jalons, planification, notification |
| `remediation/requested` | SPEC-612 | préparation d'une remédiation à la demande |
| `gap/detected` / `gap/nature-changed` / `gap/cleared` | SPEC-411 | notifications, automatisme 5 |
| `review/answered` | SPEC-701 | FSRS, série |
| `review/session-completed` | SPEC-703 | automatisme 2 (proposition consommée), jalons SPEC-723 |
| `exam/submitted` | SPEC-614 | correction, lacunes |
| `exercise/submitted` | SPEC-613 | correction tuteur |
| `tutor/question-asked` | SPEC-610 | automatisme 6 |
| `automation/action-proposed` / `-applied` / `-undone` | SPEC-711 | notifications, journal |
| `notification/requested` | tous | SPEC-209 |
| `billing/subscription-changed` | SPEC-210 | statut d'abonnement |
| `billing/payment-failed` | SPEC-210 | notification d'échec de paiement (SPEC-725) |
| `account/export-requested` / `account/deletion-requested` | SPEC-211 | jobs d'export et de suppression |
| `group/member-joined` / `-left` | SPEC-724 | planification, notifications |
| `cron/hourly-tick` | SPEC-203 (`learny_worker/scheduler.py`, :05) | consommateurs d'heure globale |
| `user/local-tick` | SPEC-203 (tick horaire, un par utilisateur actif) | programme du jour (SPEC-209), micro-séance, bilan, fin des heures calmes : fenêtre locale `[T − 5 min, T + 55 min[`, `run_at` |
| `cron/nightly` | SPEC-203 (01:30 UTC) | créneaux manqués (SPEC-411), banques (SPEC-513), suppressions et purge des exports (SPEC-211), purge des clés d'idempotence (SPEC-208), `shared.purge_outbox` (SPEC-203) |
| `job/daily-digest` | SPEC-2205 (planification du bilan) | envoi du bilan à l'instant prévu (ADR-2014) |
| `sdd/demo-requested` | SPEC-203 (page de démonstration) | `devtools.demo_job` |

Le catalogue vit dans `packages/contracts/src/events.ts` (`EVENTS` : nom → schéma Zod de `data`),
exporté en `api/events.schema.json`. Côté Python, il est validé à la consommation
(`learny_worker/consumers.py`) et tout événement émis par un cas d'usage est écrit dans la même
transaction (`event_outbox`). Le worker réclame les lignes, crée les livraisons et les exécute.

Crons (UTC, `learny_worker/scheduler.py`, ADR-0067) : `cron/hourly-tick` (toutes les heures, :05)
→ expiration des automatismes dus, puis un `user/local-tick` par apprenant actif, puis le tick
lui-même ; `cron/nightly` (01:30 UTC) → statut « manqué » des créneaux, banques de questions en lot,
notions dues du lendemain, suppression des comptes à J+30, purge des exports expirés et des
livraisons anciennes.

## 6. Environnements

| Environnement | Web | API | Base | Jobs | IA |
|---|---|---|---|---|---|
| `local` | `pnpm dev` (localhost:3000) | `uv run uvicorn learny_api.main:app` (localhost:3001) | Supabase CLI (Docker) | `python -m learny_worker` (ou `JOBS_MODE=inline` en test) | modèle simulé par défaut (`LLM_MODE=mock` en local) ; réel si clé fournie |
| `test` (CI) | build + `next start` | `uvicorn` (lancé par Playwright) | Supabase CLI (Docker) | consommateur inline (horloge figée) | modèle simulé obligatoire |
| `preview` | Vercel preview `learny-web` | Coolify `api-py` (image `ghcr.io/…/learny-py`) | Supabase projet `preview` (UE) | Coolify `worker-py` | réel, plafond bas |
| `production` | Vercel `learny-web` (fra1) | Coolify `api-py` (fra1) | Supabase projet `prod` (UE, Francfort) | Coolify `worker-py` | réel |

Le détail des variables est dans `.env.example` et ADR-2042 (liste close des variables lues par le
backend Python).

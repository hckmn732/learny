# Learny

Application web d'apprentissage intensif pilotée par un tuteur IA : l'apprenant décrit un objectif (certification, examen, montée en compétence), Learny construit le programme, génère les cours à partir de ses apports, vérifie chaque module par un quiz, détecte et comble les lacunes, planifie les révisions (FSRS) et l'agenda jusqu'à la date cible, et agit de lui-même pour éviter le décrochage.

Ce dépôt est un **référentiel Spec-Driven Development** : il contient tout ce qu'il faut pour que des agents IA implémentent, testent, prouvent et livrent Learny **en totale autonomie**, spécification par spécification, sans solliciter le porteur du projet.

> Agents IA : commencez par [`AGENTS.md`](AGENTS.md).

## Démarrer la livraison autonome

```bash
node tools/sdd/next.mjs      # prochaine action
```

Avec Claude Code : `/sdd-loop` (boucle complète jusqu'à `v2.0.0`) ou `/sdd-next` (une seule spécification). Le processus est décrit dans [`docs/engineering/sdd-process.md`](docs/engineering/sdd-process.md) ; l'avancement réel est dans [`progress/PROGRESS.md`](progress/PROGRESS.md).

## Organisation

| Dossier | Contenu |
|---|---|
| [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) | règles des agents (zéro intervention humaine), ordre de lecture, boucle, interdits |
| [`docs/product/`](docs/product) | vision, **règles métier normatives** (`BR-*`), écrans et routes, glossaire |
| [`docs/architecture/`](docs/architecture) | vue d'ensemble, modèle de données, API, IA, canvas du backend Python |
| [`docs/engineering/`](docs/engineering) | conventions de code, stratégie de test et conformité visuelle, Git, processus SDD |
| [`docs/adr/`](docs/adr) | registre des décisions (les ADR priment sur tout autre document) |
| [`docs/legacy/`](docs/legacy) | spécification historique v0 (référence, non normative) |
| [`specs/`](specs) | catalogue (`catalog.json`), gabarit, checkpoints, spécifications par phase |
| [`design/maquettes/`](design/maquettes) | 14 écrans cliquables, référence visuelle (ouvrir `index.html`) |
| [`tools/sdd/`](tools/sdd) | outillage de la boucle : `next`, `start`, `validate`, `evidence`, `complete`, `fail`, `checkpoint`, `status`, `audit`, `adr`, `changelog` |
| [`progress/`](progress) | suivi généré : `PROGRESS.md`, `state.json`, anomalies, blocages, audit |
| [`evidence/`](evidence) | preuves de validation par spécification et par checkpoint |

Le backend est **unique et Python** : `apps/api` est la façade FastAPI qui sert tout le contrat
(`api/openapi.yaml`, 156 opérations et 11 routes spéciales), `apps/worker` est le worker
(outbox PostgreSQL, 23 consommateurs d'événements, 2 crons), et `apps/web` (Next.js) en est un
client pur. Le TypeScript backend — `apps/api` Hono, `apps/worker` Inngest et les paquets serveur —
a été retiré (ADR-2043, SPEC-2302) : il ne reste en TypeScript que le contrat, les clients, le
design system et l'outillage. Décisions : ADR-2001 à ADR-2043 ; référence technique :
[`docs/architecture/python-backend/`](docs/architecture/python-backend).

## Phases et versions

| Phase | Contenu | Checkpoint | Version |
|---|---|---|---|
| P0 | Fondations et infrastructure | CP-0 | v0.0.0 |
| P1 | Base de données, migrations et sécurité | CP-1 | v0.1.0 |
| P2 | Backend, API et services transverses | CP-2 | v0.2.0 |
| P3 | Design system et coquille | CP-3 | v0.3.0 |
| P4 | Moteur d'apprentissage déterministe | CP-4 | v0.4.0 |
| P5 | IA, ingestion et briques | CP-5 | v0.5.0 |
| P6 | Parcours d'apprentissage | CP-6 | v0.6.0 |
| P7 | Révisions, agenda, engagement et réglages | CP-7 | v0.7.0 |
| P8 | Plateforme, qualité et livraison V1 | CP-8 | **v1.0.0** |
| P9 | V2 | CP-9 | **v2.0.0** |
| P10 à P13 | Séparation backend / frontend et clients multiples | CP-10 à CP-13 | tags de checkpoint |
| P20 à P23 | Backend Python : inventaire, socle, domaines, bascule et retrait du TypeScript | CP-20 à CP-23 | tags de checkpoint |

## Voir les maquettes

Double-cliquer sur `design/maquettes/index.html`, ou servir le dossier : `python -m http.server 8123 --directory design/maquettes` puis ouvrir http://localhost:8123.

## Environnement local

Prérequis : Node 24, pnpm 10, uv, Docker Engine/Compose et Supabase CLI 2. Copier `.env.example` vers `.env.local` (jamais versionné) pour les valeurs locales ; aucun secret de production n'est nécessaire.

```bash
pnpm install
pnpm dev:up        # Supabase local et Mailpit
pnpm dev:check     # un état par service : supabase, postgres, mailpit, web, API Python
pnpm dev           # web sur :3000 et API Python sur :3001
pnpm dev:down      # arrêt sans supprimer les volumes
```

La commande `pnpm dev` démarre le web par Turborepo et la façade Python ; le navigateur reste sur
`:3000` et `apps/web/proxy.ts` relaie `/api/*` vers la façade sur `:3001` avec les variables
`API_INTERNAL_URL` et `API_PROXY_SECRET`. Les deux processus du backend se lancent à la main :

```bash
uv run uvicorn learny_api.main:app --host 127.0.0.1 --port 3001   # façade FastAPI
python -m learny_worker                                          # worker (outbox, consommateurs, crons)
```

| Service | URL locale |
|---|---|
| Application web | http://127.0.0.1:3000 |
| API Python (façade FastAPI) | http://127.0.0.1:3001 (`/health`) |
| Worker Python | aucun port d'écoute (santé par fichier, `PORT` en conteneur) |
| Supabase API / Studio | http://127.0.0.1:54321 · http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (UI / SMTP) | http://127.0.0.1:8025 · `127.0.0.1:1025` |

- **Port occupé** : `pnpm dev:up` et `pnpm dev:check` nomment le service et le port en échec ; aucun port n'est changé silencieusement. Libérez-le puis relancez.
- **Remise à zéro** : `pnpm db:reset --yes` applique les migrations et la seed minimale. La commande refuse `APP_ENV=production|preview` et toute `DATABASE_URL` non locale. `pnpm db:seed:demo` échoue explicitement jusqu'à SPEC-115.
- **Données** : `pnpm dev:down` conserve les volumes Docker et la base Supabase ; une seconde invocation de `pnpm dev:up` réutilise les services sains.
- **Secrets** : seules des valeurs locales publiques figurent dans `.env.example` ; `.env.local` et les identifiants Supabase distants ne sont jamais versionnés. Les variables lues par le backend sont la liste close d'ADR-2042.

## Socle technique

Node 24 LTS, pnpm, Turborepo, TypeScript strict, Next.js (App Router, React 19, Tailwind 4) et
Hono pour le seul proxy du web ; Python 3.13 sur uv pour le backend (FastAPI + Uvicorn, Pydantic
v2, SQLAlchemy 2 Core, psycopg 3), Supabase (Postgres + pgvector, Auth, Storage, RLS), Drizzle
pour le schéma et les migrations, outbox PostgreSQL maison pour les jobs, AI SDK et fournisseurs
LLM (Claude par tâche, clé personnelle chiffrée), Voyage, Resend, Web Push, Stripe, Sentry,
Vitest, pytest, Playwright et Docker. Détails et justifications :
[`docs/architecture/overview.md`](docs/architecture/overview.md) et le registre des ADR.

## Ce qui reste en TypeScript

- `packages/contracts` — source unique du contrat (registre Zod, export `api/openapi.yaml`, catalogue d'erreurs, schémas d'événements), consommée par la génération Python et le SDK ;
- `apps/web` et ses dépendances — `api-client`, `api-sdk`, `bricks`, `ui`, `i18n`, `config`, `core`, `domain` ;
- `packages/db` — schéma Drizzle, migrations, matrice RLS (aucun accès aux données à l'exécution) ;
- l'outillage (`tools/`, `apps/web/e2e`), et la piste mobile (`apps/mobile`, branche `mobile`).

## Dépôt distant

`origin` = `https://github.com/hckmn732/learny.git`, créé et connecté par le porteur du projet. Conventions : [`docs/engineering/git.md`](docs/engineering/git.md) et [`CONTRIBUTING.md`](CONTRIBUTING.md).

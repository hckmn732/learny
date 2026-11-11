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
| [`docs/architecture/`](docs/architecture) | vue d'ensemble, modèle de données, API, IA |
| [`docs/engineering/`](docs/engineering) | conventions de code, stratégie de test et conformité visuelle, Git, processus SDD |
| [`docs/adr/`](docs/adr) | registre des décisions (les ADR priment sur tout autre document) |
| [`docs/legacy/`](docs/legacy) | spécification historique v0 (référence, non normative) |
| [`specs/`](specs) | catalogue (`catalog.json`), gabarit, checkpoints, 132 spécifications par phase |
| [`design/maquettes/`](design/maquettes) | 14 écrans cliquables, référence visuelle (ouvrir `index.html`) |
| [`tools/sdd/`](tools/sdd) | outillage de la boucle : `next`, `start`, `validate`, `evidence`, `complete`, `fail`, `checkpoint`, `status`, `audit`, `adr`, `changelog` |
| [`progress/`](progress) | suivi généré : `PROGRESS.md`, `state.json`, anomalies, blocages, audit |
| [`evidence/`](evidence) | preuves de validation par spécification et par checkpoint |

Le code applicatif (`apps/`, `packages/`, `supabase/`) est créé par les spécifications, à partir de SPEC-001.

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

## Voir les maquettes

Double-cliquer sur `design/maquettes/index.html`, ou servir le dossier : `python -m http.server 8123 --directory design/maquettes` puis ouvrir http://localhost:8123.

## Socle technique

Node 24 LTS, pnpm, Turborepo, TypeScript strict, Next.js (App Router, React 19, Tailwind 4), Supabase (Postgres + pgvector, Auth, Storage, RLS), Drizzle, Inngest, AI SDK (Claude par tâche, clé personnelle chiffrée), Voyage, Resend, Web Push, Stripe, Sentry, Vitest, Playwright, Docker pour le développement et l'auto-hébergement. Détails et justifications : [`docs/architecture/overview.md`](docs/architecture/overview.md) et le registre des ADR.

## Dépôt distant

`origin` = `https://github.com/hckmn732/learny.git`, créé et connecté par le porteur du projet. Conventions : [`docs/engineering/git.md`](docs/engineering/git.md) et [`CONTRIBUTING.md`](CONTRIBUTING.md).

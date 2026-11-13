# Architecture — vue d'ensemble

Complète `docs/legacy/specification-v0/3-Architecture-technique.md` (raisonnement d'origine). Les choix sont actés dans `docs/adr/`. Ce document est normatif pour la structure du dépôt et la circulation des données.

## 1. Principes

1. **Le modèle propose, le code valide et exécute** (ADR-0021). Toute écriture (apprenant ou tuteur) passe par un service applicatif qui valide (Zod) puis persiste.
2. **Déterministe d'abord** (ADR-0020) : `packages/learning-engine` est du TypeScript pur, sans I/O ni IA, testé unitairement et par propriétés.
3. **Contrats partagés** : schémas Zod dans `packages/contracts`, réutilisés par l'API, l'UI, les jobs et le tuteur.
4. **Isolation des données au niveau base** : Row Level Security sur toutes les tables (ADR-0022).
5. **Tout appel IA passe par `packages/llm`** (résolution du modèle, plafond, journal) ; aucun autre paquet n'importe un SDK de fournisseur.
6. **Horloge injectable** partout (ADR-0047) : aucune utilisation directe de `Date.now()` / `new Date()` hors de `packages/core/clock`.

## 2. Topologie

```
Navigateur (PWA)
   │  HTTPS
   ▼
apps/web  (Next.js App Router, Vercel région UE fra1)
   ├─ Server Components : lecture via services (client Supabase de l'utilisateur, RLS)
   ├─ Route handlers /api/v1/* : mutations et lectures client (contrats Zod)
   ├─ /api/inngest : point d'entrée des jobs (packages/jobs)
   ├─ /api/webhooks/stripe
   └─ /_dev/sdd/[specId] : pages de démonstration (hors production, ADR-0049)
   │
   ├──► Supabase (UE) : Postgres 15+ (pgvector, unaccent, pg_trgm), Auth, Storage
   ├──► Inngest Cloud : orchestration des jobs (événements, cron, reprises)
   ├──► Fournisseurs IA via packages/llm (Anthropic par défaut ; BYOK)
   ├──► Voyage AI (embeddings), API de recherche web (repli)
   ├──► Resend (e-mail), Web Push (VAPID), Stripe (abonnement), Sentry (erreurs)
apps/worker (Node, Hono) : sert les mêmes fonctions Inngest pour l'auto-hébergement Docker (ADR-0017)
```

## 3. Organisation du dépôt

```
/
├── AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
├── apps/
│   ├── web/                    Next.js : app/, components/ (spécifiques), lib/, middleware.ts, e2e/ (Playwright)
│   └── worker/                 serveur Hono exposant /api/inngest (Docker)
├── packages/
│   ├── config/                 schéma des variables d'environnement (Zod), constantes produit, identifiants de modèles
│   ├── core/                   horloge, fuseaux, erreurs typées, logger, utilitaires (Result, ids)
│   ├── contracts/              schémas Zod des entrées/sorties API, événements, DTO ; génération OpenAPI
│   ├── db/                     schéma Drizzle, migrations SQL, politiques RLS, client, repositories, seed
│   ├── ui/                     design system : jetons, composants React, icônes, utilitaires d'accessibilité
│   ├── bricks/                 13 types de briques : schema.ts, grade.ts (si auto-corrigée), view.tsx, registre
│   ├── learning-engine/        FSRS, maîtrise, lacunes, tirages, planificateur, rétention, série, échauffement
│   ├── llm/                    fournisseurs (AI SDK), tâches→modèles, BYOK chiffré, qualification, plafond, journal, modèle simulé de test
│   ├── tutor/                  registre d'actions (outils), boucle agent, prompts par tâche, garde-fous
│   ├── ingestion/              extraction PDF/web/YouTube/image, découpage, embeddings, recherche sémantique
│   ├── jobs/                   client Inngest, catalogue d'événements, fonctions (handlers) et crons
│   ├── notifications/          routage in-app/e-mail/push, heures calmes, plafond, gabarits e-mail (React Email)
│   ├── automations/            moteur et 10 automatismes
│   ├── services/               services applicatifs (cas d'usage) appelés par l'API et les jobs
│   └── testing/                fabriques de données, helpers Vitest/Playwright, collecte de preuves, horloge figée
├── design/maquettes/           maquettes de référence (ne pas modifier)
├── design/references/          captures de référence générées (SPEC-005)
├── docs/                       produit, architecture, ingénierie, ADR, legacy
├── specs/                      catalogue, gabarit, spécifications par phase, checkpoints
├── tools/sdd/                  outillage du référentiel (suivi, boucle, validation, audit)
├── progress/                   état (state.json), tableau de bord (PROGRESS.md), anomalies
├── evidence/                   preuves par spécification et par checkpoint
├── supabase/                   config CLI Supabase (config.toml), migrations générées, seed.sql
├── docker/                     Dockerfiles et compose (dev, auto-hébergé)
└── .github/                    CI, modèles de PR
```

Règles de dépendance entre paquets (vérifiées par ESLint `import/no-restricted-paths`, SPEC-001) :
- `learning-engine` n'importe que `core` (et `ts-fsrs`).
- `bricks` importe `core`, `contracts`, `ui` (pour `view.tsx` seulement).
- `llm` importe `core`, `config`, `contracts`, `db`.
- `tutor` importe `llm`, `bricks`, `learning-engine`, `contracts`, `core`, `db`, `ingestion`.
- `services` peut importer tous les paquets sauf `ui` ; `apps/*` importent tout.
- Aucun paquet n'importe `apps/*`.

## 4. Flux types

**Lecture d'un écran** : Server Component → `services.<domaine>.get…(ctx)` → repository Drizzle avec client utilisateur (RLS) → DTO `contracts` → composants `ui`.

**Mutation** : composant client → `fetch('/api/v1/...')` via le client typé `apps/web/lib/api-client.ts` → wrapper `handler()` (auth, Zod, idempotence, limitation) → service → transaction → émission d'événement (`jobs.send`) → réponse DTO.

**Traitement long** : événement Inngest → fonction de `packages/jobs` découpée en `step.run` idempotents → services → notifications.

**Appel IA** : service → `tutor.run(task, input, ctx)` → `llm.resolve(user, task)` → contrôle de plafond → appel (outils stricts) → validation Zod de chaque appel d'outil → exécution par le registre → journal `ai_calls`.

## 5. Catalogue des événements de domaine (`packages/jobs/src/events.ts`)

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
| `exam/submitted` | SPEC-614 | correction, lacunes |
| `exercise/submitted` | SPEC-613 | correction tuteur |
| `tutor/question-asked` | SPEC-610 | automatisme 6 |
| `automation/action-proposed` / `-applied` / `-undone` | SPEC-711 | notifications, journal |
| `notification/requested` | tous | SPEC-209 |
| `billing/subscription-changed` | SPEC-210 | droits IA |
| `billing/payment-failed` | SPEC-210 | notification d'échec de paiement (SPEC-725) |
| `account/export-requested` / `account/deletion-requested` | SPEC-211 | jobs d'export et de suppression |
| `group/member-joined` / `-left` | SPEC-724 | planification, notifications |
| `cron/hourly-tick` | SPEC-203 (cron `TZ=UTC 5 * * * *`) | consommateurs d'heure globale |
| `user/local-tick` | SPEC-203 (tick horaire, un par utilisateur actif) | programme du jour (SPEC-209), micro-séance, bilan, fin des heures calmes : fenêtre locale `[T − 5 min, T + 55 min[`, `dueInWindow` + `step.sleepUntil` |
| `cron/nightly` | SPEC-203 (cron `TZ=UTC 30 1 * * *`) | créneaux manqués (SPEC-411), banques (SPEC-513), suppressions et purge des exports (SPEC-211), purge des clés d'idempotence (SPEC-208), `nightly-outbox-cleanup` (SPEC-203) |
| `sdd/demo-requested` | SPEC-203 (page de démonstration) | `sdd-demo-pipeline` |

Le catalogue vit dans `packages/contracts/src/events.ts` (`EVENTS` : nom → schéma Zod de `data`), réexporté par `packages/jobs/src/events.ts`. Tout événement est émis par un service via `withTransaction` / `emitAfterCommit` (boîte d'envoi `event_outbox`, ADR-0122) : écrit dans la transaction, envoyé après validation, renvoyé à chaque tick horaire en cas de panne d'Inngest.

Crons (UTC, Inngest) : `cron/hourly-tick` (toutes les heures, :05) → pour chaque utilisateur dont l'heure locale correspond : programme du jour (heure choisie), micro-séance (H), bilan hebdomadaire, fin des heures calmes ; `cron/nightly` (01:30 UTC) → statut « manqué » des créneaux, banques de questions en lot, notions dues du lendemain, suppression des comptes à J+30, purge des exports expirés.

## 6. Environnements

| Environnement | Web | Base | Jobs | IA |
|---|---|---|---|---|
| `local` | `pnpm dev` (localhost:3000) | Supabase CLI (Docker) | Inngest Dev Server | modèle simulé par défaut (`LLM_MODE=mock`) ; réel si clé fournie |
| `test` (CI) | build + `next start` | Supabase CLI (Docker) | Inngest Dev Server | modèle simulé obligatoire |
| `preview` | Vercel preview | Supabase projet `preview` (UE) | Inngest branche | réel, plafond bas |
| `production` | Vercel (fra1) | Supabase projet `prod` (UE, Francfort) | Inngest Cloud | réel |

Le détail des variables est dans `.env.example` et `packages/config` (SPEC-009).

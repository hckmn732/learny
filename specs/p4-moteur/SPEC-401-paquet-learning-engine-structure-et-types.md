---
id: SPEC-401
title: "Paquet learning-engine : structure et types"
phase: P4
priority: V1
depends_on: [SPEC-001, SPEC-004]
business_rules: []
screens: []
adrs: [ADR-0020, ADR-0047, ADR-0049, ADR-0070, ADR-0140]
visual: demo
---

# SPEC-401 — Paquet learning-engine : structure et types

## 1. Objectif

Créer le paquet `@learny/learning-engine` (TypeScript pur, déterministe, sans I/O ni IA) avec ses types d'entrée/sortie sérialisables et leurs schémas Zod, son adaptateur de temps, son générateur pseudo-aléatoire à graine, ses paramètres centralisés dans `packages/config/src/product.ts` (`ENGINE`), son jeu de données de référence (formation SAP des maquettes) et ses conventions de tests (Vitest, horloge figée, fast-check). Toutes les spécifications SPEC-402 à SPEC-411 s'appuient sur ce socle.

## 2. Contexte

Le moteur d'apprentissage porte toutes les décisions chiffrées du produit (FSRS, maîtrise, lacunes, tirages, planification, rétention, série, échauffement) sans aucun appel IA (ADR-0020, BR-IA-09 traitée dans les spécifications fonctionnelles). Il est appelé par `packages/services` (SPEC-411) et par le tuteur (action `get_due_notions`). Documents à lire : `docs/architecture/overview.md` §1 et §3 (frontières), `docs/engineering/conventions.md` §2, §3, §6, `docs/engineering/testing.md` §1 à §3, `docs/architecture/data-model.md` §5 à §7 (formes persistées que les types doivent refléter), ADR-0020, ADR-0047, ADR-0049, ADR-0070, ADR-0140. Données de référence : `design/maquettes/Carte.dc.html` (modules, 48 notions, liens), `design/maquettes/Programme.dc.html` (titres, chapitres, dates des modules).

## 3. Dépendances

- **SPEC-001** (`done`) : monorepo pnpm/Turborepo, configuration TypeScript stricte, ESLint plat avec frontières de paquets et interdiction de `Date.now()`/`new Date()`, Vitest (projets `unit`, `integration`), Playwright, paquets `@learny/core` et `@learny/config`.
- **SPEC-004** (`done`) : `@learny/testing` (`createFixedClock`, `REFERENCE_NOW = '2026-11-11T12:20:00.000Z'`, fixture Playwright d'horloge, `expectTokens`), couverture v8 avec seuils par paquet, fast-check installé.
- Phases antérieures terminées (verrou de phase, CP-3) : `@learny/core` expose l'horloge et les utilitaires de fuseau (SPEC-207), `@learny/config` expose `product.ts` (SPEC-009), la route `/_dev/sdd/[specId]` existe (SPEC-006) et `@learny/ui` fournit les composants (SPEC-301 à 303).
- Bibliothèques : `ts-fsrs` ≥ 5 (installée ici, utilisée en SPEC-402), `zod` ≥ 4 (repli 3.25, ADR-0003), `fast-check` ≥ 3 (devDependency). Aucun service externe : aucun mode mock nécessaire.

## 4. Règles métier couvertes

Aucune règle métier n'est implémentée directement ici ; la spécification fournit les types et paramètres dont dépendent les règles des spécifications suivantes. `ENGINE` reprend à l'identique les valeurs normatives des règles des domaines LAC, MEM, QUI, AGE, AUT, GAM et PRO de `docs/product/business-rules.md` ; un test vérifie cette concordance (CA-3).

## 5. Exigences fonctionnelles

- **EF-1** Le paquet `@learny/learning-engine` existe, se construit, se teste et s'importe depuis `packages/services` et `apps/web` par son point d'entrée unique `src/index.ts`.
- **EF-2** Chaque type public d'entrée et de sortie possède un schéma Zod exporté (`XxxSchema`) ; tout objet produit par une fonction publique du moteur passe `JSON.parse(JSON.stringify(x))` sans perte (égalité profonde) et est valide pour son schéma.
- **EF-3** Aucune fonction du moteur ne lit l'horloge, l'environnement, le réseau, le système de fichiers ou la base ; l'instant courant est toujours une entrée `now: InstantIso`.
- **EF-4** Les paramètres par défaut sont ceux de `ENGINE` (§6, ET-4) ; chaque fonction accepte un objet `params` partiel qui les surcharge (réglages de l'utilisateur).
- **EF-5** La page `/_dev/sdd/SPEC-401` affiche le résumé du jeu de référence SAP et les résultats des utilitaires (§10).

## 6. Exigences techniques

**ET-1 Arborescence** (conventions §3) :

```
packages/learning-engine/
  package.json         name @learny/learning-engine, "type": "module", exports { ".": "./src/index.ts" },
                       scripts test, lint, typecheck ; dependencies @learny/core, @learny/config, ts-fsrs, zod ;
                       devDependencies fast-check, @learny/testing, vitest
  tsconfig.json        étend la configuration racine
  vitest.config.ts     projet unit, couverture v8 seuil lignes/fonctions/branches 80 %
  README.md            rôle, API publique, exemples
  src/index.ts         exports publics uniquement
  src/types.ts         types et schémas Zod (ET-2)
  src/time.ts          adaptateur de temps (ET-3)
  src/random.ts        aléa à graine (ET-5)
  src/errors.ts        EngineError (ET-6)
  src/params.ts        fusion ENGINE + surcharges (ET-4)
  src/fixtures/sap-reference.ts   jeu de référence (ET-7)
  src/fixtures/builders.ts        fabriques de tests (ET-8)
  src/fsrs/ src/mastery/ src/gaps/ src/draw/ src/global-quiz/ src/planner/ src/progress/ src/streak/ src/warmup/
                       dossiers créés vides (fichier index.ts exportant {}) remplis par SPEC-402 à 410
  test/integration/engine-boundaries.test.ts
```

**ET-2 Types communs** (`src/types.ts`, tous exportés avec leur schéma) :

```ts
export type InstantIso = string;   // ISO 8601 UTC « YYYY-MM-DDTHH:mm:ss.sssZ » (schéma : regex + Date.parse fini)
export type IsoDate = string;      // « YYYY-MM-DD » date civile valide
export type LocalTime = string;    // « HH:mm » 00:00..23:59
export type TimeZone = string;     // IANA, validé par Intl.supportedValuesOf('timeZone') ou 'UTC'
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = lundi
export type Id = string;           // non vide, ≤ 64 caractères (UUID en production, lisible dans les fixtures)
export type FsrsRating = 'again' | 'hard' | 'good' | 'easy';
export type FsrsCardStateName = 'new' | 'learning' | 'review' | 'relearning';
export type BrickFormat = 'choice_question' | 'open_question' | 'cloze' | 'matching' | 'ordering'
  | 'categorization' | 'recall_card' | 'instruction' | 'scripted_dialogue' | 'timer';
export type ReviewSource = 'validation' | 'global_quiz' | 'warmup' | 'exercise' | 'exam' | 'self_test'
  | 'micro_session' | 'sprint' | 'offline';
export type AttemptKind = 'validation_quiz' | 'global_quiz_session' | 'remediation' | 'exercise'
  | 'mock_exam' | 'warmup' | 'micro_session' | 'sprint' | 'self_test';
export type GapNature = 'forgetting' | 'confusion' | 'misunderstanding' | 'application';
export type StudySlot = 'matin' | 'apres_midi' | 'soir';
export type ModuleStatus = 'locked' | 'open' | 'validated';
export type SlotKind = 'contributions' | 'course' | 'exercise' | 'validation_quiz' | 'global_quiz' | 'revision'
  | 'buffer' | 'sprint' | 'mock_exam' | 'warmup' | 'micro_session' | 'weekly_review';
export type SlotStatus = 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';

/** Carte ts-fsrs sérialisée, forme exacte de notion_states.fsrs (data-model §6) + learning_steps (ts-fsrs 5). */
export interface SerializedFsrsCard {
  due: InstantIso; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: FsrsCardStateName; last_review: InstantIso | null;
}
export interface GapState {
  nature: GapNature; confusedWith: Id | null; detectedAt: InstantIso; evidence: string; clearedAt: InstantIso | null;
}
export interface NotionState {           // miroir de notion_states
  userId: Id; notionId: Id; fsrs: SerializedFsrsCard | null; dueAt: InstantIso | null; mastery: number; // 0..100, 2 décimales
  firstSeenAt: InstantIso | null; lastSeenAt: InstantIso | null; successCount: number;
  gap: GapState | null; suspended: boolean; inReview: boolean;
}
export interface AnswerRecord {          // réponse projetée pour le moteur (answers + brick_versions + attempts)
  answerId: Id; attemptId: Id; attemptKind: AttemptKind; attemptNo: number; source: ReviewSource;
  notionIds: Id[];                       // ≥ 1, notion principale en tête
  format: BrickFormat; correct: boolean | null; score: number | null; maxScore: number | null;
  selfRating: FsrsRating | null;          // carte de rappel, échauffement
  timeMs: number;                          // ≥ 0
  answeredAt: InstantIso;
  chosenDistractorNotionId: Id | null;     // QCM : notion représentée par le distracteur choisi
  confusedWithNotionId: Id | null;         // association/classement : notion de l'élément mal placé
  normalizedResponse: string | null;       // réponse texte normalisée (normalizeText)
  offTopic: boolean;                       // réponse ouverte jugée hors sujet par le tuteur
  countsForGaps: boolean;                  // false pour les modules non étudiés d'un examen diagnostic
}
export interface ReviewEvent {           // revue FSRS appliquée (review_logs)
  notionId: Id; answerId: Id | null; source: ReviewSource; rating: FsrsRating; correct: boolean; timeMs: number;
  reviewedAt: InstantIso; before: SerializedFsrsCard | null; after: SerializedFsrsCard; applied: boolean;
}
export interface Availability {          // study_preferences ou formations.study_override
  hoursPerDay: number;                     // entier 1..6
  studyDays: IsoWeekday[];                 // non vide, sans doublon, trié
  preferredSlots: StudySlot[];             // non vide, sans doublon, ordre matin < apres_midi < soir
}
export interface DateRange { startsOn: IsoDate; endsOn: IsoDate } // bornes incluses, endsOn ≥ startsOn
export interface NotionRef { notionId: Id; moduleId: Id; chapterId: Id; modulePosition: number; position: number; label: string }
export interface NotionLinkRef { fromNotionId: Id; toNotionId: Id; kind: 'prerequisite' | 'confusion' | 'tutor' }
```

Les schémas refusent les champs inconnus (`.strict()`), les nombres non finis et les dates invalides (`2026-02-30`).

**ET-3 Adaptateur de temps** (`src/time.ts`, seul fichier qui convertit vers/depuis `Date`, ADR-0140) :

```ts
export function parseInstant(iso: InstantIso): number;                 // ms epoch ; EngineError INVALID_INSTANT
export function formatInstant(ms: number): InstantIso;                 // toISOString()
export function addDays(date: IsoDate, n: number): IsoDate;            // arithmétique civile, sans fuseau
export function daysBetween(a: IsoDate, b: IsoDate): number;           // b − a en jours civils (entier, signé)
export function isoWeekday(date: IsoDate): IsoWeekday;
export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1;
export function localDateOf(instant: InstantIso, tz: TimeZone): IsoDate;
export function localMinutesOf(instant: InstantIso, tz: TimeZone): number;        // 0..1439
export function instantAt(date: IsoDate, time: LocalTime, tz: TimeZone): InstantIso;
export function startOfLocalDay(date: IsoDate, tz: TimeZone): InstantIso;
export function parseLocalTime(t: LocalTime): number;                  // minutes depuis minuit
export function formatLocalTime(minutes: number): LocalTime;
```

`localDateOf`, `localMinutesOf`, `instantAt` et `startOfLocalDay` délèguent aux fonctions de fuseau de `@learny/core` (SPEC-207) ; si une conversion manque dans `@learny/core`, elle est ajoutée dans `packages/core/src/time.ts` avec ses tests, jamais réimplémentée ici. Règle des changements d'heure pour `instantAt` : une heure locale inexistante (avancement) est décalée de la durée du saut (02:30 le 28 mars 2027 à Paris → 03:30 locale) ; une heure ambiguë (recul) prend la première occurrence (décalage d'été). Complexité O(1).

**ET-4 Paramètres** : SPEC-401 ajoute à `packages/config/src/product.ts` la constante suivante (exportée aussi par le sous-chemin pur `@learny/config/product`, ADR-0140). Quand `product.ts` définit déjà une valeur de même sens (défauts des automatismes BR-AUT-*, rythme BR-ACC-08), `ENGINE` y fait référence au lieu de la dupliquer.

```ts
export const ENGINE = {
  mastery: { halfLifeDays: 14, threshold: 80, decimals: 2 },                                    // BR-LAC-01
  fsrs: { requestRetention: 0.9, allowedRetentions: [0.85, 0.9, 0.95], enableFuzz: false,       // BR-MEM-01
          enableShortTerm: true, medianWindow: 50, medianMinSamples: 5, defaultMedianMs: 20_000, // ADR-0025
          hardFactor: 2, easyFactor: 0.5 },                                                      // BR-MEM-02
  gaps: { failureRatio: 0.5, forgettingMinDays: 7, clearSuccesses: 2, clearMinDaysApart: 1,     // BR-LAC-02..06
          repeatedErrorAttempts: 2 },
  draw: { defaultSize: 12, minSize: 10, maxSize: 20, openShare: 0.3, minOpen: 1,                 // ADR-0014
          gapWeight: 3, weakWeight: 2, baseWeight: 1, totalPoints: 100 },
  globalQuiz: { maxMinutesDefault: 15, allowedMaxMinutes: [10, 15, 20, 30], notionCostSec: 60,   // BR-AUT-07
                sessionOverheadSec: 60, microMinutesDefault: 5, allowedMicroMinutes: [3, 5, 10], // BR-AUT-02
                maintenanceMaxMinutes: 5, cardDeckMax: 5, groupMin: 2, groupMax: 4,              // ADR-0015
                formatSeconds: { recall_card: 30, choice_question: 45, cloze: 45, ordering: 60,
                                 matching: 40, categorization: 40, open_question: 90 },
                gamePreferenceDefault: 'vary' },                                                  // BR-AUT-05
  planner: { moments: { matin: { start: '09:00', end: '12:00' }, apres_midi: { start: '14:00', end: '17:00' },
                        soir: { start: '18:30', end: '21:00' } },
             revisionTailMinutes: 60, globalQuizMinutes: 30, sprintMinutes: 30,                  // ADR-0029
             sprintDaysBeforeDefault: 3, allowedSprintDaysBefore: [2, 3, 5],                     // BR-AUT-08
             validationQuizMinutes: 60, bufferMinutes: 60, contributionShare: 0.6,              // BR-AGE-03
             granularityMinutes: 30, mockExam: { questions: 20, minutesPerQuestion: 2, threshold: 70 }, // BR-PRA-02
             blockedDelayDays: 3, blockedModuleExtraDays: 2, maxHoursPerDay: 6,                  // BR-FOR-14
             maintenanceGlobalQuizMinutes: 5 },
  retention: { horizonsDays: [30, 60], toleranceDays: 3,                                        // BR-MEM-06
               sources: ['global_quiz', 'micro_session', 'offline'] },
  streak: { readingMinSeconds: 300, regularityDays: 14, maxLookbackDays: 3660 },                 // BR-GAM-01/02
  milestones: { notionsRetained: 100, streakDays: 30, masteryThreshold: 80 },                     // BR-GAM-03
  warmup: { defaultCount: 3, allowedCounts: [2, 3, 5], defaultScope: 'yesterday_and_prerequisites', // BR-AUT-03
            yesterdayLookbackDays: 7 },
} as const;
export type EngineParams = typeof ENGINE;
```

`src/params.ts` : `export function withParams<K extends keyof EngineParams>(key: K, overrides?: DeepPartial<EngineParams[K]>): EngineParams[K]` (fusion profonde, tableaux remplacés et non fusionnés) ; une valeur hors des listes autorisées (`allowed…`) lève `EngineError('INVALID_PARAM')`.

**ET-5 Aléa à graine** (`src/random.ts`) : `fnv1a32(text: string): number` (FNV-1a 32 bits sur les unités UTF-16) ; `createSeededRandom(seed: string): () => number` (mulberry32 initialisé par `fnv1a32(seed)`, valeurs dans [0, 1)) ; `stableShuffle<T>(items: readonly T[], seed: string, key: (t: T) => string): T[]` (tri par `fnv1a32(seed + '|' + key(t))` puis par `key` en cas d'égalité ; ne modifie pas l'entrée). Valeurs de contrôle : `fnv1a32('') = 2166136261`, `fnv1a32('a') = 3826002220`.

**ET-6 Erreurs** (`src/errors.ts`) : `class EngineError extends Error { readonly code: EngineErrorCode; readonly details?: Record<string, unknown> }` ; codes : `INVALID_INPUT`, `INVALID_INSTANT`, `INVALID_PARAM`, `REVIEW_OUT_OF_ORDER`, `UNKNOWN_NOTION`, `INVALID_AVAILABILITY`. `assertValid<T>(schema, value): T` lève `INVALID_INPUT` avec le chemin Zod en `details.path`.

**ET-7 Jeu de référence SAP** (`src/fixtures/sap-reference.ts`, exporté par `@learny/learning-engine/fixtures` uniquement — export de sous-chemin non utilisé en production) :
- `SAP_FORMATION` : `{ formationId: 'sap', title: 'SAP S/4HANA Finance', startDate: '2026-11-02', endDate: '2026-12-11', objectives: ['operational', 'exam'], tz: 'Europe/Paris' }`.
- `SAP_AVAILABILITY` : `{ hoursPerDay: 5, studyDays: [1,2,3,4,5], preferredSlots: ['matin', 'apres_midi'] }`.
- `SAP_MODULES` (titres de `Programme.dc.html`, identifiants `sap-m1`…`sap-m7`, seuil 80) : M1 « Fondamentaux de SAP S/4HANA et navigation Fiori » 2–4 nov. 15 h, 3 chapitres ; M2 « Structure organisationnelle de la Finance » 5–6 nov. 10 h, 3 ; M3 « Comptabilité générale » 9–13 nov. 25 h, 4 ; M4 « Comptabilité fournisseurs » 16–20 nov. 25 h, 4 ; M5 « Comptabilité clients » 23–27 nov. 25 h, 4 ; M6 « Immobilisations » 30 nov.–4 déc. 25 h, 3 ; M7 « Clôture de période et préparation à la certification » 7–11 déc. 25 h, 3. Chapitres : titres de la maquette, identifiants `sap-m<n>-c<k>`.
- `SAP_NOTIONS` : les 48 notions de `Carte.dc.html` (identifiant `n-<clé de la maquette>`, libellé, module). Rattachement aux chapitres : module 3 explicite — c1 {compte, partie}, c2 {piece, entete, poste, cle, type, dates, equilibre}, c3 {acdoca}, c4 {ledgers} ; autres modules : dans l'ordre de la maquette, le chapitre k (0-based) reçoit les notions d'indice [⌊k·N/C⌋, ⌊(k+1)·N/C⌋).
- `SAP_LINKS` : les liens `p` → `prerequisite`, `c` → `confusion`, `t` → `tutor` de la maquette.
- `SAP_MASTERY_AT_REFERENCE` : maîtrise affichée par la maquette (null = jamais vue) et `SAP_GAPS_AT_REFERENCE` (cle confusion avec type 35 %, ledgers incompréhension 28 %, equilibre application 55 %, variante oubli 60 %).
- `REFERENCE_NOW = '2026-11-11T12:20:00.000Z'` (réexport de `@learny/testing`).

**ET-8 Fabriques** (`src/fixtures/builders.ts`) : `buildAnswer(partial)`, `buildNotionState(partial)`, `buildCard(partial)`, `atDaysBefore(now, days, time?)` — valeurs par défaut documentées dans le fichier, utilisées par tous les tests du paquet. Arbitraires fast-check exportés : `arbInstant(min, max)`, `arbAnswer()`, `arbAvailability()`, `arbIsoDate(min, max)`.

**ET-9 Frontières** : la règle ESLint `import/no-restricted-paths` (SPEC-001) autorise pour `packages/learning-engine/src/**` uniquement `@learny/core`, `@learny/config/product`, `ts-fsrs`, `zod` ; tout autre import (`@learny/db`, `@learny/llm`, `node:*`, `fetch`) est une erreur. Les fichiers `src/fixtures/**` peuvent en plus importer `@learny/testing`.

**ET-10 Conventions de tests du moteur** : chaque fichier commence par `describe('[SPEC-4xx] …')` ; pas d'horloge système : l'instant de référence est `REFERENCE_NOW` ; propriétés fast-check avec `{ seed: 20261111, numRuns: 200 }` par défaut (fixés pour la reproductibilité, `numRuns` ≥ 100) ; tables de cas de référence écrites en `it.each` à partir de tableaux exportés par `src/**/__cases__.ts` pour être réutilisés par les pages de démonstration.

**ET-11 Performance** : import du paquet < 50 ms ; aucune dépendance au DOM ; taille du paquet hors `ts-fsrs` < 60 Ko minifiés.

## 7. Comportements attendus et cas limites

- **CL-1** Instant mal formé (`'2026-11-11 12:20'`, `'2026-13-01T00:00:00Z'`) → `EngineError('INVALID_INSTANT')`.
- **CL-2** Date civile invalide (`2026-02-30`) ou fuseau inconnu (`Europe/Pariss`) → `EngineError('INVALID_INPUT')` avec `details.path`.
- **CL-3** Changement d'heure (printemps) : `instantAt('2027-03-28', '02:30', 'Europe/Paris')` = `2027-03-28T01:30:00.000Z` (03:30 locale) ; (automne) `instantAt('2026-10-25', '02:30', 'Europe/Paris')` = `2026-10-25T00:30:00.000Z` (première occurrence, UTC+2).
- **CL-4** Fuseau très décalé : `localDateOf('2026-11-11T12:20:00.000Z', 'Pacific/Kiritimati')` = `2026-11-12` ; `'Pacific/Pago_Pago'` = `2026-11-11` ; `localMinutesOf` cohérent (02:20 → 140, 01:20 → 80).
- **CL-5** `addDays` traverse fin de mois et année bissextile (`addDays('2028-02-28', 1)` = `2028-02-29`) et ne dépend d'aucun fuseau.
- **CL-6** Disponibilité invalide (`studyDays: []`, `hoursPerDay: 7`, `preferredSlots` en double) → `EngineError('INVALID_AVAILABILITY')`.
- **CL-7** Paramètre hors liste (`requestRetention: 0.8`) → `EngineError('INVALID_PARAM')` ; surcharge partielle valide (`{ maxMinutesDefault: 30 }`) conserve toutes les autres valeurs.
- **CL-8** Graine vide `''` : `createSeededRandom('')` est valide et reproductible ; deux graines différentes donnent des suites différentes sur les 10 premiers tirages (test sur 1 000 paires).
- **CL-9** Sérialisation : `-0`, `NaN`, `Infinity` et `undefined` sont refusés par les schémas (les sorties n'en contiennent jamais).
- **CL-10** Import interdit (`import '@learny/db'` dans `src/`) → `pnpm lint` échoue (test d'intégration ET-9).

## 8. Instructions d'implémentation

1. Créer `packages/learning-engine` (ET-1), l'ajouter à `pnpm-workspace.yaml`, à `turbo.json` (tâches `test`, `lint`, `typecheck`) et aux projets Vitest racine. Installer `ts-fsrs`, `zod`, `fast-check`. Commit `build(SPEC-401): crée le paquet learning-engine`.
2. Ajouter `ENGINE` à `packages/config/src/product.ts` et l'export de sous-chemin `@learny/config/product` (`package.json` → `exports["./product"]`), en réutilisant les constantes déjà présentes ; ajouter le test de concordance avec `docs/product/business-rules.md` dans `packages/config/src/product.test.ts` (valeurs : 14, 80, 0,90, 15, 5, 3, 24 h n'est pas concerné). Mettre à jour la règle ESLint de frontières (ET-9). Commit `feat(SPEC-401): paramètres ENGINE et frontières du moteur`.
3. Écrire `src/errors.ts`, `src/types.ts` (types + schémas Zod stricts), `src/params.ts`, `src/random.ts`, `src/time.ts` ; compléter `@learny/core` si une conversion de fuseau manque. Commit `feat(SPEC-401): types, temps, aléa et paramètres du moteur`.
4. Écrire `src/fixtures/sap-reference.ts` et `src/fixtures/builders.ts` à partir des maquettes (ET-7). Commit `feat(SPEC-401): jeu de référence SAP et fabriques`.
5. Écrire les tests unitaires et par propriétés (§12), le test d'intégration de frontières, puis `README.md`. Commit `test(SPEC-401): tests du socle du moteur`.
6. Créer `apps/web/app/_dev/sdd/SPEC-401/page.tsx` (Server Component) et `apps/web/e2e/specs/p4/spec-401.spec.ts`. Commit `feat(SPEC-401): page de démonstration du socle`.
7. Exécuter `node tools/sdd/validate.mjs SPEC-401`, compléter `evidence/SPEC-401/acceptance.md`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/**` (ET-1), `apps/web/app/_dev/sdd/SPEC-401/page.tsx`, `apps/web/e2e/specs/p4/spec-401.spec.ts`, `packages/learning-engine/test/integration/engine-boundaries.test.ts`.
- **Modifiés** : `packages/config/src/product.ts` (ajout de `ENGINE`), `packages/config/package.json` (export `./product`), configuration ESLint racine (frontières), `pnpm-workspace.yaml`, `turbo.json`, `vitest.workspace.ts` (ou équivalent SPEC-001), éventuellement `packages/core/src/time.ts` (conversion manquante, avec tests).
- **Lus / réutilisés** : `@learny/core` (horloge, fuseaux), `@learny/testing` (`REFERENCE_NOW`, `expectTokens`), `@learny/ui` (Table, Card, Badge pour la page de démonstration).

## 10. Interface et conformité visuelle

Mode `demo` (ADR-0049) : page `/_dev/sdd/SPEC-401`, rendue seulement si `ENABLE_SDD_PAGES=true`, composée avec `@learny/ui` (en-tête de page « SPEC-401 · Socle du moteur » : sur-titre 14 px gris, titre 34 px Space Grotesk, selon `docs/product/screens.md` §3).
Régions dans l'ordre (`data-testid`) :
1. `engine-params` — tableau « Paramètres du moteur » : une ligne par clé de premier niveau de `ENGINE` avec ses valeurs principales (ex. « mastery · demi-vie 14 j · seuil 80 % »).
2. `sap-reference` — cartes statistiques : première carte sombre « 7 modules », puis « 24 chapitres », « 48 notions », « 64 liens » (valeurs calculées depuis le jeu), puis tableau des modules (n°, titre, dates, heures, chapitres, notions).
3. `time-cases` — tableau des cas CL-3 et CL-4 (entrée, sortie attendue, sortie obtenue, ✓/✗ dans un `Badge`).
4. `random-cases` — `fnv1a32('')`, `fnv1a32('a')`, 5 premiers tirages de `createSeededRandom('SPEC-401')` affichés avec 6 décimales.
Le nombre de liens affiché est celui du jeu (`SAP_LINKS.length`), vérifié par le test.
Contrôles visuels : jetons (`expectTokens` : fond de page, carte sombre `#111113` et chiffre `#C6F432`, titres Space Grotesk, cartes blanches bordure `#E7E6E1` rayon 24 px), structure (4 régions dans l'ordre, textes ci-dessus), ligne de base `toHaveScreenshot('spec-401-demo.png', { maxDiffPixelRatio: 0.01 })`. Accessibilité : tableaux avec `<caption>`, en-têtes `scope="col"`, aucune violation axe serious/critical.

## 11. Critères d'acceptation

- **CA-1** `pnpm --filter @learny/learning-engine test` passe ; la couverture de lignes du paquet est ≥ 80 % (rapport v8).
- **CA-2** Pour 200 objets générés par fast-check par type public, `Schema.parse(JSON.parse(JSON.stringify(x)))` est profondément égal à `x`.
- **CA-3** Les valeurs de `ENGINE` concordent avec la table suivante (test de concordance) :

| Clé | Valeur | Règle |
|---|---|---|
| `mastery.halfLifeDays` / `mastery.threshold` | 14 / 80 | BR-LAC-01 |
| `fsrs.requestRetention` / `allowedRetentions` | 0,9 / [0,85 ; 0,9 ; 0,95] | BR-MEM-01 |
| `fsrs.hardFactor` / `easyFactor` | 2 / 0,5 | BR-MEM-02 |
| `globalQuiz.maxMinutesDefault` / `allowedMaxMinutes` | 15 / [10, 15, 20, 30] | BR-AUT-07 |
| `globalQuiz.microMinutesDefault` | 5 | BR-AUT-02 |
| `planner.sprintDaysBeforeDefault` / `sprintMinutes` | 3 / 30 | BR-AUT-08 |
| `planner.bufferMinutes` / `globalQuizMinutes` | 60 / 30 | BR-AGE-03, ADR-0029 |
| `warmup.defaultCount` / `allowedCounts` | 3 / [2, 3, 5] | BR-AUT-03 |
| `milestones.notionsRetained` / `streakDays` | 100 / 30 | BR-GAM-03 |
| `retention.horizonsDays` / `toleranceDays` | [30, 60] / 3 | BR-MEM-06 |

- **CA-4** Les cas de temps suivants donnent exactement les sorties attendues :

| Fonction | Entrée | Sortie |
|---|---|---|
| `instantAt` | 2026-11-11, 09:00, Europe/Paris | 2026-11-11T08:00:00.000Z |
| `instantAt` | 2027-03-28, 02:30, Europe/Paris | 2027-03-28T01:30:00.000Z |
| `instantAt` | 2026-10-25, 02:30, Europe/Paris | 2026-10-25T00:30:00.000Z |
| `localDateOf` | 2026-11-11T12:20:00.000Z, Pacific/Kiritimati | 2026-11-12 |
| `localMinutesOf` | 2026-11-11T12:20:00.000Z, Europe/Paris | 800 |
| `isoWeekday` | 2026-11-11 | 3 |
| `daysBetween` | 2026-11-02 → 2026-12-11 | 39 |
| `addDays` | 2028-02-28, +1 | 2028-02-29 |

- **CA-5** `lint` échoue sur un import interdit dans `packages/learning-engine/src` et passe sur le paquet réel (test d'intégration).
- **CA-6** Le jeu SAP contient 7 modules, 24 chapitres, 48 notions ; chaque notion a exactement un chapitre de son module ; aucun lien n'a la même origine et cible.
- **CA-7** La page `/_dev/sdd/SPEC-401` affiche les 4 régions, tous les cas de `time-cases` sont marqués ✓, et la page renvoie 404 quand `ENABLE_SDD_PAGES` n'est pas `true`.

## 12. Plan de tests

**Unitaires** (Vitest, `describe('[SPEC-401] …')`, horloge non utilisée, `REFERENCE_NOW`) :
- `src/time.test.ts` : table CA-4, CL-1 à CL-5 ; propriété : `localDateOf(instantAt(d, t, tz), tz) === d` pour tout jour d (2026–2028), t ∈ {00:00..23:30 par 30 min} hors heures inexistantes, tz ∈ {Europe/Paris, America/New_York, Asia/Tokyo, Pacific/Kiritimati} ; propriété : `addDays(addDays(d, n), -n) === d`, `daysBetween(d, addDays(d, n)) === n`.
- `src/random.test.ts` : valeurs de contrôle FNV, reproductibilité, `stableShuffle` est une permutation et ne modifie pas l'entrée (propriété), CL-8.
- `src/params.test.ts` : fusion profonde, tableaux remplacés, CL-7.
- `src/types.test.ts` : CA-2 (propriétés aller-retour JSON sur `AnswerRecord`, `NotionState`, `SerializedFsrsCard`, `Availability`, `ReviewEvent`), CL-6, CL-9.
- `src/fixtures/sap-reference.test.ts` : CA-6.
- `packages/config/src/product.test.ts` : `describe('[SPEC-401] concordance ENGINE')` — table CA-3.

**Intégration** (`describe('[SPEC-401] frontières du moteur')`, `test/integration/engine-boundaries.test.ts`) : exécute ESLint (API Node) sur un fichier temporaire de `packages/learning-engine/src/__probe__.ts` contenant `import '@learny/db'` → au moins une erreur `import/no-restricted-paths` ; sur `src/index.ts` → 0 erreur ; vérifie que `src/**` ne contient ni `Date.now(`, ni `fetch(`, ni `process.env` (CA-5, EF-3).

**End-to-end** (`apps/web/e2e/specs/p4/spec-401.spec.ts`, vidéo activée, horloge figée 2026-11-11T12:20:00Z) :
- `test('page de démonstration du socle du moteur @SPEC-401')` : ouvre `/_dev/sdd/SPEC-401`, vérifie les 4 régions dans l'ordre, les cartes « 7 modules », « 24 chapitres », « 48 notions », le libellé du nombre de liens, tous les badges ✓ de `time-cases` ; axe sans violation serious/critical ; capture `screenshots/spec-401-demo.png` (CA-7).
- `test('pages de démonstration désactivées @SPEC-401')` : serveur sans `ENABLE_SDD_PAGES` (projet Playwright dédié ou requête sur l'instance de production de test) → statut 404 (CA-7).

**Visuel** : `test('conformité visuelle du socle @SPEC-401 @visual')` : `expectTokens` sur `[data-testid=sap-reference] .stat-card:first-child` (fond `#111113`, chiffre `#C6F432`), titre (Space Grotesk 34 px × 0,9), cartes (bordure `#E7E6E1`, rayon 24 px) ; `toHaveScreenshot('spec-401-demo.png', { maxDiffPixelRatio: 0.01 })`.

**Non-régression** : rejouer `@SPEC-001`, `@SPEC-004`, `@SPEC-006`, `@SPEC-009` et `pnpm test:unit` complet.

**Couverture** : seuil 80 % lignes/fonctions/branches sur `packages/learning-engine` (configuration Vitest du paquet), mesuré à chaque spécification P4 et au checkpoint CP-4.

| Critère | Tests |
|---|---|
| CA-1 | exécution du paquet + rapport de couverture (`checks.json`) |
| CA-2 | `src/types.test.ts` (propriétés aller-retour) |
| CA-3 | `packages/config/src/product.test.ts` |
| CA-4 | `src/time.test.ts` |
| CA-5 | `test/integration/engine-boundaries.test.ts` |
| CA-6 | `src/fixtures/sap-reference.test.ts` |
| CA-7 | e2e `@SPEC-401` (deux tests) et `@SPEC-401 @visual` |

## 13. Preuves attendues

`evidence/SPEC-401/` : `unit.json`, `integration.json`, `e2e.json`, vidéo `video/spec-401-demo.webm`, captures `screenshots/spec-401-demo.png`, comparaison de ligne de base, `checks.json` (couverture du paquet ≥ 80 %), `acceptance.md` (CA-1 à CA-7 avec lien vers le test).

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7, plus : `ENGINE` présent dans `product.ts` et importable par `@learny/config/product` ; frontière ESLint effective ; jeu de référence SAP exporté par `@learny/learning-engine/fixtures` ; README du paquet décrivant l'API publique.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0020 (moteur pur), ADR-0047 (date de référence), ADR-0049 (page de démonstration), ADR-0070 (Vitest, fast-check), ADR-0003 (versions).
- Décision créée : **ADR-0140** — `ENGINE` dans `product.ts` importable par le moteur via `@learny/config/product` ; représentation du temps en chaînes ISO ; `EngineError` ; aléa à graine unique. Conséquence documentaire : `docs/architecture/overview.md` §3 est à compléter (l'ADR prime).
- Complément de données : `SerializedFsrsCard` ajoute `learning_steps` (champ de `ts-fsrs` 5) à la forme JSON décrite dans `docs/architecture/data-model.md` §6 ; aucune migration n'est nécessaire (colonne `jsonb`).
- Hypothèse : `@learny/core` (SPEC-207) fournit les conversions de fuseau ; sinon elles y sont ajoutées par cette spécification, jamais dupliquées dans le moteur.

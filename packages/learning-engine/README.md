# @learny/learning-engine

Moteur d'apprentissage **pur** de Learny (ADR-0020, ADR-0140). Ce paquet TypeScript ne lit ni
l'horloge, ni l'environnement, ni le réseau, ni la base : l'instant courant est toujours une entrée
`now: InstantIso`. Les services de `@learny/services` persistent ses sorties ; le tuteur l'appelle
pour les notions dues.

## API publique

Import unique : `@learny/learning-engine`.

- **Types et schémas Zod stricts** (`src/types.ts`) : `InstantIso`, `IsoDate`, `LocalTime`,
  `TimeZone`, `SerializedFsrsCard`, `NotionState`, `AnswerRecord`, `ReviewEvent`, `Availability`,
  `DateRange`, `NotionRef`, `NotionLinkRef` et leurs schémas `XxxSchema`. Les objets inconnus, les
  nombres non finis (dont `-0`) et les dates civiles impossibles sont refusés.
- **Temps** (`src/time.ts`) : `parseInstant`, `formatInstant`, `addDays`, `daysBetween`,
  `isoWeekday`, `compareDates`, `localDateOf`, `localMinutesOf`, `instantAt`, `startOfLocalDay`,
  `parseLocalTime`, `formatLocalTime`. `instantAt` décale une heure locale inexistante de la durée
  du saut (02:30 → 03:30 à Paris au printemps).
- **Aléa reproductible** (`src/random.ts`) : `fnv1a32`, `createSeededRandom`, `stableShuffle`.
- **Maîtrise** (`src/mastery/calculate.ts`) : `calculateMastery({ answers, at, threshold?, halfLifeDays? })`
  applique BR-LAC-01 — moyenne des scores partiels pondérée par `0,5^(âge/14 j)`, seuil 80 %.
  Le résultat expose la maîtrise brute (0–100, double précision), le statut, la somme des poids,
  le score pondéré et le détail par réponse (âge, poids). Une réponse future ou un score hors
  `[0, 1]` lève `INVALID_INPUT`.
- **Lacunes** (`src/gaps/`, SPEC-404) : `detectGap({ notion, attempts, mastery, now, existingGap?,
fsrsLapsed?, params? })` détecte après une tentative qualifiante sous le seuil ou une erreur
  répétée sur deux tentatives, classe la nature (`forgetting`, `confusion`, `misunderstanding`,
  `application`) selon BR-LAC-03 et renvoie l’action BR-LAC-04 ainsi que l’événement
  `detected|nature_changed|null`. `clearGap({ gap, successes, mastery, now, notion?, params? })`
  lève la lacune après deux réussites espacées d’au moins 24 h et une maîtrise au seuil, avec
  l’événement `cleared`. `normalizeError`, `gapErrorKey`, `isGapFailure` et `isGapSuccess` exposent
  les règles de normalisation et d’échec. Les bornes viennent de l’appelant (`ENGINE.gaps` et
  `ENGINE.mastery.threshold`), jamais de `@learny/config` dans le module pur (ADR-0282).
- **Tirage d’une tentative** (`src/draw/`, SPEC-405) : `drawAttempt({ notions, bank, seenFingerprints, gaps, params, targetCount?, seed })` retourne les références `brickId/brickVersionId` tirées, les quotas par notion, le rapport `exhausted` (capacité, banque épuisée, limite de taille) et les diagnostics d’exclusion. Les paramètres viennent de l’appelant (`ENGINE.draw` et `ENGINE.mastery.threshold`), jamais de `@learny/config` dans le module pur (ADR-0284). La couverture, la surpondération des lacunes, l’exclusion par empreinte et l’ordre canonique sont déterministes à seed égale.
- **Paramètres** (`src/params.ts`) : `withParams('fsrs', { requestRetention: 0.95 })` fusionne les
  défauts `ENGINE` de `@learny/config/product` avec une surcharge partielle. Les tableaux sont
  remplacés, une valeur hors liste `allowed…` lève `INVALID_PARAM`.
- **Répétition espacée** (`src/fsrs/`) : `personalMedianMs` et `recentValidTimes` calculent la
  médiane personnelle par format sur les 50 réponses valides les plus récentes ; `createNotionCard`,
  `gradeReview`, `applyReview` et `previewGrades` créent, notent, appliquent et prévisualisent une
  carte `ts-fsrs` sans I/O. L'appelant fournit `ENGINE.fsrs` (rétention, fenêtre, minimum, défaut,
  facteurs) ; `gradeReview` renvoie `rating: null` pour une réponse incomplète (CL-4 d'ADR-0278).
- **Erreurs** (`src/errors.ts`) : `EngineError` (`INVALID_INPUT`, `INVALID_INSTANT`,
  `INVALID_PARAM`, `REVIEW_OUT_OF_ORDER`, `UNKNOWN_NOTION`, `INVALID_AVAILABILITY`) et
  `assertValid(schema, value)`. `assertAvailability` porte le code dédié de CL-6.
- **Série et jalons** (`src/streak/`, SPEC-409) : `calculateStreak` retourne la série courante, les
  14 cases de régularité et le dernier jour qualifiant ; `detectMilestones` retourne uniquement les
  jalons nouveaux (`module_validated:<moduleId>`, `notions_100`, `streak_30`). Les deux fonctions
  reçoivent leurs bornes métier dans `params` (`ENGINE.streak`, `ENGINE.milestones`) et ne lisent
  jamais `@learny/config` (ADR-0281).
- **Planificateur** (`src/planner/`) : `planSchedule({ formations, preferences, params,
existingSlots, now })` place les activités au premier créneau compatible, réserve la marge après
  chaque quiz et le quiz global quotidien, puis renvoie créneaux triés, conflits, capacité restante
  et options BR-FOR-14. `replanSchedule` conserve terminés, manqués et déplacements manuels valides.
  `findCompatibleSlots(activity, calendar, preferences, count = 3)` renvoie les prochains créneaux
  libres. Les paramètres viennent de l'appelant (miroir de `ENGINE.planner`, ADR-0280).

Les dossiers `fsrs/`, `gaps/`, `draw/`, `global-quiz/`, `planner/`, `progress/`, `streak/` et
`warmup/` sont les points d'accueil de SPEC-402 et SPEC-404 à SPEC-410.

## Jeu de référence et fabriques

Sous-chemin `@learny/learning-engine/fixtures` (démonstrations et tests uniquement) :

```ts
import {
  SAP_MODULES,
  SAP_NOTIONS,
  SAP_LINKS,
  SAP_MASTERY_AT_REFERENCE,
  SAP_GAPS_AT_REFERENCE,
  REFERENCE_NOW,
} from '@learny/learning-engine/fixtures';
```

Le jeu reprend la formation SAP S/4HANA Finance des maquettes : 7 modules, 24 chapitres,
48 notions et 59 liens. `REFERENCE_NOW` vaut `2026-11-11T12:20:00.000Z` (13:20 à Paris, ADR-0047).

Sous-chemin `@learny/learning-engine/fixtures/builders` : `buildAnswer`, `buildNotionState`,
`buildCard`, `buildGap`, `buildReviewEvent`, `atDaysBefore`, et les arbitraires fast-check
`arbInstant`, `arbIsoDate`, `arbAnswer`, `arbAvailability`, `arbNotionState`, `arbCard`,
`arbGap`, `arbReviewEvent`.

## Exemple

```ts
import { instantAt, localDateOf, withParams } from '@learny/learning-engine';

const dueAt = instantAt('2026-11-12', '09:00', 'Europe/Paris');
const day = localDateOf(dueAt, 'Europe/Paris');
const fsrs = withParams('fsrs', { requestRetention: 0.95 });
```

## Tests

```bash
pnpm --filter @learny/learning-engine test
pnpm test:unit -t SPEC-401
```

Les tests sont déterministes : horloge figée `REFERENCE_NOW`, `LLM_MODE=mock`, propriétés
fast-check avec `{ seed: 20261111, numRuns: 200 }`. La couverture v8 du paquet exige 80 % de
lignes, fonctions et branches.

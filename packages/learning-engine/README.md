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
- **Paramètres** (`src/params.ts`) : `withParams('fsrs', { requestRetention: 0.95 })` fusionne les
  défauts `ENGINE` de `@learny/config/product` avec une surcharge partielle. Les tableaux sont
  remplacés, une valeur hors liste `allowed…` lève `INVALID_PARAM`.
- **Erreurs** (`src/errors.ts`) : `EngineError` (`INVALID_INPUT`, `INVALID_INSTANT`,
  `INVALID_PARAM`, `REVIEW_OUT_OF_ORDER`, `UNKNOWN_NOTION`, `INVALID_AVAILABILITY`) et
  `assertValid(schema, value)`. `assertAvailability` porte le code dédié de CL-6.

Les dossiers `fsrs/`, `mastery/`, `gaps/`, `draw/`, `global-quiz/`, `planner/`, `progress/`,
`streak/` et `warmup/` sont les points d'accueil de SPEC-402 à SPEC-410.

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

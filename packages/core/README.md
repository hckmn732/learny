# @learny/core

Primitives partagées par tout le monorepo, sans dépendance applicative.

## API publique

- `Clock` : `{ now(): Date }`.
- `clock` : horloge courante, initialisée par `createClockFromEnv(process.env)`.
- `createClockFromEnv(env)` : horloge figée si `CLOCK_FIXED_AT` est une date ISO valide, horloge système sinon ; lève `Error('CLOCK_FIXED_AT invalide : <valeur>')` si la valeur est invalide.
- `systemClock` : horloge système.
- `setClock(c)` : remplace l'horloge (tests).

- `AppError(code, detail, extra?)` : erreur typée portant un `code` stable, et facultativement `status`, `requestId`, `errors` ; un code reçu de l'API est conservé tel quel.
- `ERROR_CATALOG`, `ErrorCode` : catalogue minimal des codes (statut HTTP, titre), complété par SPEC-201.
- `isAppError(value)` : garde de type.

- `time.ts` (SPEC-207, ADR-0030) : fonctions pures de l'instant et d'un fuseau IANA explicite, jamais du fuseau du processus. `toUserZone`, `formatUserDate`, `userLocalDay`, `userLocalHour`, `userWeekday`, `startOfUserDay` / `endOfUserDay` / `userDayBounds` (intervalle `[début, fin[`, jours de 23, 24 ou 25 h), `instantsAtLocalTime`, `isQuietHours` / `nextOutsideQuietHours` (début inclus, fin exclue, plage à cheval sur minuit), `parseTimeZone` (erreur `VALIDATION_FAILED` si invalide), `detectUserTimeZone` (repli `Europe/Paris`), `isValidIanaZone`.

`src/clock.ts` est le seul fichier autorisé à appeler `Date.now()` ou `new Date()` sans argument (ADR-0047).

```ts
import { clock } from '@learny/core';

const now = clock.now();
```

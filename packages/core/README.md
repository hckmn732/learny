# @learny/core

Primitives partagées par tout le monorepo, sans dépendance applicative.

## API publique

- `Clock` : `{ now(): Date }`.
- `clock` : horloge courante, initialisée par `createClockFromEnv(process.env)`.
- `createClockFromEnv(env)` : horloge figée si `CLOCK_FIXED_AT` est une date ISO valide, horloge système sinon ; lève `Error('CLOCK_FIXED_AT invalide : <valeur>')` si la valeur est invalide.
- `systemClock` : horloge système.
- `setClock(c)` : remplace l'horloge (tests).

`src/clock.ts` est le seul fichier autorisé à appeler `Date.now()` ou `new Date()` sans argument (ADR-0047).

```ts
import { clock } from '@learny/core';

const now = clock.now();
```

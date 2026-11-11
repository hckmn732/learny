# @learny/contracts

Schémas Zod des entrées et sorties de l'API `/api/v1`, partagés par les route handlers, le client API et les tests. N'importe que `zod` (et, plus tard, les types de `@learny/core`).

## API publique

- `HealthResponse` : schéma (et type) de la réponse de `GET /api/v1/health` — `status` (`ok` | `degraded`), `version`, `commit`, `database` (`ok` | `unavailable` | `not_configured`). Les champs supplémentaires sont acceptés ; aucun des quatre champs ne peut être retiré.
- `HEALTH_STATUSES`, `DATABASE_STATUSES` : valeurs admises.

```ts
import { HealthResponse } from '@learny/contracts';

const body = HealthResponse.parse(await response.json());
```
